import { describe, it, expect } from "@jest/globals";
import {
  createResendSender,
  EmailSendError,
  isRetryable,
  parseAllowlist,
  sendEmail,
  type EmailMessage,
  type EmailSettings,
} from "../lib/email.js";
import {
  bookingConfirmedEmail,
  escapeHtml,
  eventReminderEmail,
  formatEventTime,
  type BookingEmailData,
} from "../lib/email-templates.js";
import { FakeEmailSender } from "./fake-email-sender.js";

const message: EmailMessage = {
  to: "me@example.com",
  subject: "Hello",
  text: "Hi",
  html: "<p>Hi</p>",
  idempotencyKey: "booking-confirmed/abc",
};

function settings(overrides: Partial<EmailSettings> = {}) {
  const lines: string[] = [];
  const sender = new FakeEmailSender();
  return {
    sender,
    lines,
    settings: {
      sender,
      allowlist: parseAllowlist("me@example.com"),
      log: (line: string) => lines.push(line),
      ...overrides,
    } satisfies EmailSettings,
  };
}

describe("sandbox allowlist", () => {
  it("sends to an allowed address, ignoring case and spaces", async () => {
    const { sender, settings: s } = settings({
      allowlist: parseAllowlist(" other@example.com , ME@Example.com "),
    });
    const outcome = await sendEmail({ ...message, to: "Me@EXAMPLE.com" }, s);
    expect(outcome).toEqual({ status: "sent", id: "fake-1" });
    expect(sender.sent).toHaveLength(1);
  });

  it("skips anyone else, logs it without the address, and doesn't throw", async () => {
    const { sender, lines, settings: s } = settings();
    const outcome = await sendEmail(
      { ...message, to: "stranger@example.com" },
      s,
    );
    expect(outcome).toEqual({ status: "skipped", reason: "sandbox" });
    expect(sender.sent).toHaveLength(0);
    expect(lines).toEqual(["[email] skipped: sandbox (booking-confirmed/abc)"]);
    expect(lines.join()).not.toContain("stranger");
  });

  it("an unset or empty allowlist allows nobody", async () => {
    for (const value of [undefined, "", " , "]) {
      const { sender, settings: s } = settings({
        allowlist: parseAllowlist(value),
      });
      expect(await sendEmail(message, s)).toEqual({
        status: "skipped",
        reason: "sandbox",
      });
      expect(sender.sent).toHaveLength(0);
    }
  });

  it('"*" allows everyone (for when a domain is verified)', async () => {
    const { sender, settings: s } = settings({
      allowlist: parseAllowlist("*"),
    });
    await sendEmail({ ...message, to: "anyone@example.com" }, s);
    expect(sender.sent).toHaveLength(1);
  });

  it("no API key → skipped as disabled, nothing thrown", async () => {
    const { lines, settings: s } = settings({ sender: null });
    expect(await sendEmail(message, s)).toEqual({
      status: "skipped",
      reason: "disabled",
    });
    expect(lines).toEqual([
      "[email] skipped: disabled (booking-confirmed/abc)",
    ]);
  });
});

describe("Resend sender", () => {
  type Call = { url: string; init: RequestInit };

  function fakeFetch(respond: () => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return respond();
    }) as typeof fetch;
    return { fn, calls };
  }

  it("posts to Resend's API with the key, User-Agent and idempotency key", async () => {
    const { fn, calls } = fakeFetch(() => Response.json({ id: "email-123" }));
    const sender = createResendSender(
      "re_test_key",
      "Tixbook <onboarding@resend.dev>",
      fn,
    );

    expect(await sender.send(message)).toEqual({ id: "email-123" });

    const call = calls[0]!;
    expect(call.url).toBe("https://api.resend.com/emails");
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    expect(headers["User-Agent"]).toBeTruthy();
    expect(headers["Idempotency-Key"]).toBe("booking-confirmed/abc");
    expect(JSON.parse(String(call.init.body))).toEqual({
      from: "Tixbook <onboarding@resend.dev>",
      to: ["me@example.com"],
      subject: "Hello",
      text: "Hi",
      html: "<p>Hi</p>",
    });
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("a 5xx is retryable; the error has no address or key in it", async () => {
    const { fn } = fakeFetch(() =>
      Response.json(
        { name: "application_error", message: "for me@example.com" },
        { status: 500 },
      ),
    );
    const sender = createResendSender("re_test_key", "from@x", fn);
    const err = await sender.send(message).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmailSendError);
    expect((err as EmailSendError).retryable).toBe(true);
    expect((err as EmailSendError).message).toBe(
      "Resend answered 500 application_error",
    );
  });

  it("a validation error is permanent", async () => {
    const { fn } = fakeFetch(() =>
      Response.json({ name: "validation_error" }, { status: 403 }),
    );
    const sender = createResendSender("re_test_key", "from@x", fn);
    const err = (await sender
      .send(message)
      .catch((e: unknown) => e)) as EmailSendError;
    expect(err.retryable).toBe(false);
    expect(err.status).toBe(403);
  });

  it("a timeout or network error is retryable", async () => {
    for (const failure of [
      new DOMException("The operation timed out", "TimeoutError"),
      new TypeError("fetch failed"),
    ]) {
      const fn = (async () => {
        throw failure;
      }) as typeof fetch;
      const sender = createResendSender("re_test_key", "from@x", fn);
      const err = (await sender
        .send(message)
        .catch((e: unknown) => e)) as EmailSendError;
      expect(err).toBeInstanceOf(EmailSendError);
      expect(err.retryable).toBe(true);
    }
  });

  it("sorts Resend's errors into retryable and permanent", () => {
    expect(isRetryable(503, "service_unavailable")).toBe(true);
    expect(isRetryable(429, "rate_limit_exceeded")).toBe(true);
    expect(isRetryable(429, "daily_quota_exceeded")).toBe(false);
    expect(isRetryable(409, "concurrent_idempotent_requests")).toBe(true);
    expect(isRetryable(409, "invalid_idempotent_request")).toBe(false);
    expect(isRetryable(422, "invalid_parameter")).toBe(false);
    expect(isRetryable(401, "missing_api_key")).toBe(false);
    expect(isRetryable(400, undefined)).toBe(false);
  });
});

describe("email templates", () => {
  const data: BookingEmailData = {
    attendeeName: "Sam <b>",
    reference: "TB-ABC123",
    seats: 2,
    eventTitle: `Party <script>alert("x")</script> & "friends"`,
    // 19:00 in London (GMT in December)
    startsAt: new Date("2026-12-05T19:00:00Z"),
    timezone: "Europe/London",
    format: "IN_PERSON",
    venueName: "The Hall",
    venueAddress: "1 High St, London",
  };
  const web = "https://tix-book.vercel.app";

  it("escapes organiser text in the HTML", () => {
    const { html, text } = bookingConfirmedEmail(data, web);
    expect(html).not.toContain("<script>");
    expect(html).toContain(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;friends&quot;",
    );
    expect(html).toContain("Sam &lt;b&gt;");
    // Plain text isn't HTML, so it's left as typed
    expect(text).toContain(data.eventTitle);
  });

  it("has the details and links to My tickets", () => {
    const { subject, text, html } = bookingConfirmedEmail(data, web);
    expect(subject).toBe(`Booking confirmed: ${data.eventTitle}`);
    expect(text).toContain("TB-ABC123");
    expect(text).toContain("2 seats");
    expect(text).toContain("The Hall, 1 High St, London");
    expect(text).toContain("Saturday, 5 December 2026 at 19:00");
    expect(text).toContain("https://tix-book.vercel.app/my-tickets");
    expect(html).toContain('href="https://tix-book.vercel.app/my-tickets"');
  });

  it("never contains a ticket token or a meeting link", () => {
    const online = {
      ...data,
      format: "ONLINE" as const,
      venueName: null,
      venueAddress: null,
    };
    for (const email of [
      bookingConfirmedEmail(online, web),
      eventReminderEmail(online, web),
    ]) {
      const all = email.subject + email.text + email.html;
      // A JWT is three base64url parts: eyJ...
      expect(all).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
      expect(all).not.toContain("meet");
      expect(email.text).toContain(
        "Online. The joining link is on your ticket in My tickets.",
      );
    }
  });

  it("reminder has its own subject", () => {
    expect(eventReminderEmail(data, web).subject).toBe(
      `Reminder: ${data.eventTitle} is coming up`,
    );
  });

  it("shows the time in the event's time zone, falls back to London", () => {
    expect(
      formatEventTime(new Date("2026-07-01T18:00:00Z"), "Europe/London"),
    ).toBe("Wednesday, 1 July 2026 at 19:00");
    expect(formatEventTime(new Date("2026-07-01T18:00:00Z"), "Not/AZone")).toBe(
      "Wednesday, 1 July 2026 at 19:00",
    );
  });

  // Render runs in UTC. The email must show London time whatever the
  // server's own time zone is: 19:00 BST in summer is 18:00 UTC.
  // The tests run in UTC (jest.global-setup.js), so formatting with the
  // server's zone by mistake would show 18:00 here and fail.
  it("shows London time on a UTC server, in summer (BST) and winter (GMT)", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC");
    // Summer (BST, UTC+1)
    expect(
      formatEventTime(new Date("2026-07-01T18:00:00Z"), "Europe/London"),
    ).toBe("Wednesday, 1 July 2026 at 19:00");
    // Winter (GMT, UTC+0)
    expect(
      formatEventTime(new Date("2026-12-05T19:00:00Z"), "Europe/London"),
    ).toBe("Saturday, 5 December 2026 at 19:00");
    // The whole email, not just the helper
    const { text } = bookingConfirmedEmail(
      { ...data, startsAt: new Date("2026-07-01T18:00:00Z") },
      web,
    );
    expect(text).toContain("When: Wednesday, 1 July 2026 at 19:00");
  });

  it("escapeHtml escapes the five special characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});
