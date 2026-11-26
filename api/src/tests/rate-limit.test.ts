import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { MemoryStore, type KeyValueStore } from "../lib/kv-store.js";
import { setStoreForTests } from "../lib/redis.js";
import {
  LIMITS,
  LOGIN_BACKOFF,
  rateLimitSettings,
  waitAfterFailures,
} from "../lib/rate-limit.js";

// Rate limits (decisions 064, 065) with the in-memory store and a fake
// clock. Supertest always connects from 127.0.0.1, which is normally exempt,
// so the exemption is turned off here, and each "visitor" gets its own IP
// through X-Forwarded-For (trusted for 1 hop in this file only).

const runId = Date.now();
const email = `auth-test-ratelimit-${runId}@example.com`;
const password = "correct-horse-1";
let clock = Date.UTC(2026, 10, 25, 12, 0, 30); // 30 s into a minute
let ipCounter = 0;

// A new visitor: an IP nobody has used yet in this file
function newIp() {
  ipCounter++;
  return `203.0.${Math.floor(ipCounter / 200)}.${(ipCounter % 200) + 1}`;
}

function login(ip: string, body: object) {
  return request(app)
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", ip)
    .send(body);
}

const brokenStore: KeyValueStore = {
  get: () => Promise.reject(new Error("redis down")),
  set: () => Promise.reject(new Error("redis down")),
  del: () => Promise.reject(new Error("redis down")),
  incr: () => Promise.reject(new Error("redis down")),
  ttl: () => Promise.reject(new Error("redis down")),
};

beforeAll(async () => {
  app.set("trust proxy", 1);
  rateLimitSettings.exemptLoopback = false;
  rateLimitSettings.now = () => clock;
  await prisma.user.create({
    data: {
      name: "Rate limit user",
      role: "ATTENDEE",
      email,
      passwordHash: await hashPassword(password),
    },
  });
});

beforeEach(() => {
  // Each test starts 30 s into a new minute (so Retry-After is predictable)
  clock = (Math.floor(clock / 60_000) + 1) * 60_000 + 30_000;
  setStoreForTests(new MemoryStore(() => clock));
});

afterAll(async () => {
  rateLimitSettings.exemptLoopback = true;
  rateLimitSettings.now = () => Date.now();
  app.set("trust proxy", 0);
  await prisma.user.deleteMany({
    where: { email: { startsWith: "auth-test-ratelimit-" } },
  });
  await prisma.$disconnect();
});

describe("per-IP limits", () => {
  it("login: 10 a minute per IP, then 429 with Retry-After", async () => {
    const ip = newIp();
    // Unknown emails, so the per-account wait doesn't get involved
    for (let i = 0; i < LIMITS.login.limit; i++) {
      const res = await login(ip, {
        email: `auth-test-ratelimit-nobody-${i}-${runId}@example.com`,
        password: "wrong",
      });
      expect(res.status).toBe(401);
    }
    const blocked = await login(ip, { email, password });
    expect(blocked.status).toBe(429);
    // 30 s into the minute → 30 s until the window ends
    expect(blocked.get("Retry-After")).toBe("30");
    expect(blocked.body.error).toBe(
      "Too many attempts. Please wait 30 seconds and try again.",
    );

    // Another visitor isn't affected
    expect((await login(newIp(), { email, password })).status).toBe(200);

    // The next minute starts a new count
    clock += 30_000;
    expect((await login(ip, { email, password })).status).toBe(200);
  });

  it("sign-up: 10 an hour per IP", async () => {
    const ip = newIp();
    for (let i = 0; i < LIMITS.signup.limit; i++) {
      // Invalid bodies (400) still count: the limit is on requests
      const res = await request(app)
        .post("/api/v1/auth/signup")
        .set("X-Forwarded-For", ip)
        .send({});
      expect(res.status).toBe(400);
    }
    const blocked = await request(app)
      .post("/api/v1/auth/signup")
      .set("X-Forwarded-For", ip)
      .send({
        name: "Too many",
        email: `auth-test-ratelimit-signup-${runId}@example.com`,
        password,
      });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.get("Retry-After"))).toBeGreaterThan(60);
    // Nothing was created
    expect(
      await prisma.user.count({
        where: { email: `auth-test-ratelimit-signup-${runId}@example.com` },
      }),
    ).toBe(0);
  });

  it("seat holds: 30 a minute per IP (counted before the login check)", async () => {
    const ip = newIp();
    for (let i = 0; i < LIMITS.hold.limit; i++) {
      const res = await request(app)
        .post("/api/v1/events/some-event/bookings")
        .set("X-Forwarded-For", ip)
        .send({});
      expect(res.status).toBe(401);
    }
    const blocked = await request(app)
      .post("/api/v1/events/some-event/bookings")
      .set("X-Forwarded-For", ip)
      .send({});
    expect(blocked.status).toBe(429);
    expect(blocked.get("Retry-After")).toBe("30");
  });

  it("ticket verify: 120 a minute per IP", async () => {
    const ip = newIp();
    for (let i = 0; i < LIMITS.ticketVerify.limit; i++) {
      await request(app)
        .post("/api/v1/tickets/verify")
        .set("X-Forwarded-For", ip)
        .send({})
        .expect(401);
    }
    const blocked = await request(app)
      .post("/api/v1/tickets/verify")
      .set("X-Forwarded-For", ip)
      .send({});
    expect(blocked.status).toBe(429);
  });

  it("doesn't limit routes that aren't listed (the event list)", async () => {
    const ip = newIp();
    for (let i = 0; i < 15; i++) {
      await request(app)
        .get("/api/v1/events?q=nothing-matches-this")
        .set("X-Forwarded-For", ip)
        .expect(200);
    }
  });
});

describe("login: per-account wait after failures", () => {
  it("doubles from 30 s after 5 failures, up to 15 minutes", () => {
    expect([1, 2, 3, 4].map(waitAfterFailures)).toEqual([0, 0, 0, 0]);
    expect(waitAfterFailures(5)).toBe(30_000);
    expect(waitAfterFailures(6)).toBe(60_000);
    expect(waitAfterFailures(7)).toBe(120_000);
    expect(waitAfterFailures(9)).toBe(480_000);
    expect(waitAfterFailures(10)).toBe(LOGIN_BACKOFF.maxWaitMs);
    expect(waitAfterFailures(1000)).toBe(LOGIN_BACKOFF.maxWaitMs);
  });

  it("blocks even the right password during the wait, from any IP; success clears it", async () => {
    // 5 failures from 5 different IPs (an attacker spreading out)
    for (let i = 0; i < LOGIN_BACKOFF.freeFailures; i++) {
      expect((await login(newIp(), { email, password: "wrong" })).status).toBe(
        401,
      );
    }

    // Now a 30 s wait for this email, whoever asks
    const blocked = await login(newIp(), { email, password });
    expect(blocked.status).toBe(429);
    expect(blocked.get("Retry-After")).toBe("30");
    // No session was created during the wait
    expect(blocked.get("Set-Cookie")).toBeUndefined();

    // After the wait, the right password works...
    clock += 30_000;
    expect((await login(newIp(), { email, password })).status).toBe(200);

    // ...and cleared the count: one wrong password is just a 401 again
    expect((await login(newIp(), { email, password: "wrong" })).status).toBe(
      401,
    );
    expect((await login(newIp(), { email, password })).status).toBe(200);
  });

  it("waits longer after each failure, but never forever", async () => {
    for (let i = 0; i < LOGIN_BACKOFF.freeFailures; i++) {
      await login(newIp(), { email, password: "wrong" });
    }
    // Failure 6 after waiting 30 s → a 60 s wait
    clock += 30_000;
    expect((await login(newIp(), { email, password: "wrong" })).status).toBe(
      401,
    );
    const blocked = await login(newIp(), { email, password });
    expect(blocked.get("Retry-After")).toBe("60");

    // Keep failing: the wait stops growing at 15 minutes
    for (let i = 0; i < 10; i++) {
      clock += LOGIN_BACKOFF.maxWaitMs;
      await login(newIp(), { email, password: "wrong" });
    }
    const capped = await login(newIp(), { email, password });
    expect(capped.get("Retry-After")).toBe("900");

    // No permanent lockout: after 15 minutes, the owner gets in
    clock += LOGIN_BACKOFF.maxWaitMs;
    expect((await login(newIp(), { email, password })).status).toBe(200);
  });

  it("treats an unknown email the same way (no hint that it doesn't exist)", async () => {
    const nobody = `auth-test-ratelimit-ghost-${runId}@example.com`;
    for (let i = 0; i < LOGIN_BACKOFF.freeFailures; i++) {
      expect(
        (await login(newIp(), { email: nobody, password: "wrong" })).status,
      ).toBe(401);
    }
    const blocked = await login(newIp(), { email: nobody, password: "wrong" });
    expect(blocked.status).toBe(429);
    expect(blocked.get("Retry-After")).toBe("30");
  });

  it("forgets failures 24 hours after the last one", async () => {
    for (let i = 0; i < LOGIN_BACKOFF.freeFailures - 1; i++) {
      await login(newIp(), { email, password: "wrong" });
    }
    clock += LOGIN_BACKOFF.forgetAfterMs;
    // 4 old failures forgotten: this is failure 1, not 5, so no wait
    await login(newIp(), { email, password: "wrong" });
    expect((await login(newIp(), { email, password })).status).toBe(200);
  });
});

describe("when Redis is down", () => {
  it("keeps limiting, in memory (not fail-open)", async () => {
    setStoreForTests(brokenStore);
    const ip = newIp();
    for (let i = 0; i < LIMITS.login.limit; i++) {
      await login(ip, {
        email: `auth-test-ratelimit-down-${i}-${runId}@example.com`,
        password: "wrong",
      });
    }
    expect((await login(ip, { email, password })).status).toBe(429);
  });

  it("still logs people in (not fail-closed)", async () => {
    setStoreForTests(brokenStore);
    expect((await login(newIp(), { email, password })).status).toBe(200);
  });
});
