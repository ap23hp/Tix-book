import { describe, it, expect } from "@jest/globals";
import {
  CircuitBreaker,
  CircuitOpenError,
  type BreakerState,
} from "../lib/circuit-breaker.js";
import {
  createEmailBreaker,
  EmailSendError,
  parseAllowlist,
  sendEmail,
} from "../lib/email.js";
import { FakeEmailSender } from "./fake-email-sender.js";

// A clock the test moves by hand
function fakeClock() {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const fail = async () => {
  throw new Error("provider down");
};
const ok = async () => "ok";

function makeBreaker(clock = fakeClock()) {
  const changes: string[] = [];
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    cooldownMs: 10_000,
    countsAsFailure: (err) => !(err instanceof TypeError),
    onStateChange: (from: BreakerState, to: BreakerState) =>
      changes.push(`${from}->${to}`),
    now: clock.now,
  });
  return { breaker, changes, clock };
}

describe("circuit breaker", () => {
  it("opens after N failures in a row, then fails fast without calling", async () => {
    const { breaker, changes } = makeBreaker();
    for (let i = 0; i < 3; i++) {
      await expect(breaker.run(fail)).rejects.toThrow("provider down");
    }
    expect(breaker.getState()).toBe("open");
    expect(changes).toEqual(["closed->open"]);

    let called = false;
    await expect(
      breaker.run(async () => {
        called = true;
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(called).toBe(false);
  });

  it("a success in between resets the count", async () => {
    const { breaker } = makeBreaker();
    await expect(breaker.run(fail)).rejects.toThrow();
    await expect(breaker.run(fail)).rejects.toThrow();
    await breaker.run(ok);
    await expect(breaker.run(fail)).rejects.toThrow();
    await expect(breaker.run(fail)).rejects.toThrow();
    expect(breaker.getState()).toBe("closed");
  });

  it("errors that don't count (provider answered) don't open it", async () => {
    const { breaker } = makeBreaker();
    for (let i = 0; i < 5; i++) {
      await expect(
        breaker.run(async () => {
          throw new TypeError("refused, but the provider answered");
        }),
      ).rejects.toThrow();
    }
    expect(breaker.getState()).toBe("closed");
  });

  it("after the cool-down: one trial; success closes it", async () => {
    const { breaker, changes, clock } = makeBreaker();
    for (let i = 0; i < 3; i++)
      await expect(breaker.run(fail)).rejects.toThrow();
    clock.advance(9_999);
    expect(breaker.getState()).toBe("open");
    clock.advance(1);
    expect(breaker.getState()).toBe("half-open");
    expect(await breaker.run(ok)).toBe("ok");
    expect(breaker.getState()).toBe("closed");
    expect(changes).toEqual([
      "closed->open",
      "open->half-open",
      "half-open->closed",
    ]);
  });

  it("a failed trial opens it again for another cool-down", async () => {
    const { breaker, clock } = makeBreaker();
    for (let i = 0; i < 3; i++)
      await expect(breaker.run(fail)).rejects.toThrow();
    clock.advance(10_000);
    await expect(breaker.run(fail)).rejects.toThrow("provider down");
    expect(breaker.getState()).toBe("open");
    clock.advance(5_000);
    await expect(breaker.run(ok)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("half-open lets only ONE trial through at a time", async () => {
    const { breaker, clock } = makeBreaker();
    for (let i = 0; i < 3; i++)
      await expect(breaker.run(fail)).rejects.toThrow();
    clock.advance(10_000);

    let release!: () => void;
    const slowTrial = breaker.run(
      () => new Promise<string>((resolve) => (release = () => resolve("ok"))),
    );
    // A second call while the trial is still running fails fast
    await expect(breaker.run(ok)).rejects.toBeInstanceOf(CircuitOpenError);
    release();
    expect(await slowTrial).toBe("ok");
    expect(breaker.getState()).toBe("closed");
  });
});

describe("the email breaker inside sendEmail", () => {
  const message = {
    to: "me@example.com",
    subject: "s",
    text: "t",
    html: "<p>t</p>",
    idempotencyKey: "booking-confirmed/x",
  };

  it("after 5 provider failures, stops calling Resend and fails retryably", async () => {
    const clock = fakeClock();
    const lines: string[] = [];
    const sender = new FakeEmailSender();
    let calls = 0;
    const counting = {
      send: (m: typeof message) => {
        calls++;
        return sender.send(m);
      },
    };
    const settings = {
      sender: counting,
      allowlist: parseAllowlist("me@example.com"),
      log: (line: string) => lines.push(line),
      breaker: createEmailBreaker((line) => lines.push(line), clock.now),
    };

    sender.failNext(5, true);
    for (let i = 0; i < 5; i++) {
      await expect(sendEmail(message, settings)).rejects.toBeInstanceOf(
        EmailSendError,
      );
    }
    expect(calls).toBe(5);
    expect(lines).toContain("[email] circuit closed -> open");

    // Open: the 6th email isn't sent to Resend at all, and the error is
    // retryable, so the queue will try it again later
    const err = (await sendEmail(message, settings).catch(
      (e: unknown) => e,
    )) as EmailSendError;
    expect(err).toBeInstanceOf(EmailSendError);
    expect(err.retryable).toBe(true);
    expect(err.message).toBe("Email provider circuit open");
    expect(calls).toBe(5);

    // A minute later Resend is back: one trial, and it closes
    clock.advance(60_000);
    expect(await sendEmail(message, settings)).toEqual({
      status: "sent",
      id: "fake-1",
    });
    expect(lines).toContain("[email] circuit half-open -> closed");
    // No address in any log line
    expect(lines.join("\n")).not.toContain("me@example.com");
  });

  it("permanent errors (Resend answered) never open it", async () => {
    const sender = new FakeEmailSender();
    const breaker = createEmailBreaker(() => {});
    const settings = {
      sender,
      allowlist: parseAllowlist("me@example.com"),
      log: () => {},
      breaker,
    };
    sender.failNext(8, false);
    for (let i = 0; i < 8; i++) {
      await expect(sendEmail(message, settings)).rejects.toBeInstanceOf(
        EmailSendError,
      );
    }
    expect(breaker.getState()).toBe("closed");
  });

  it("sandbox skips never touch the breaker", async () => {
    const breaker = createEmailBreaker(() => {});
    const sender = new FakeEmailSender();
    sender.failNext(10, true);
    const settings = {
      sender,
      allowlist: parseAllowlist("someone-else@example.com"),
      log: () => {},
      breaker,
    };
    for (let i = 0; i < 10; i++) {
      expect(await sendEmail(message, settings)).toEqual({
        status: "skipped",
        reason: "sandbox",
      });
    }
    expect(breaker.getState()).toBe("closed");
  });
});
