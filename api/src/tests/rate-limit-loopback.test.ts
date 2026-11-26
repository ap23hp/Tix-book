import { describe, it, expect, afterEach } from "@jest/globals";
import express from "express";
import request from "supertest";
import { MemoryStore } from "../lib/kv-store.js";
import { setStoreForTests } from "../lib/redis.js";
import {
  exemptLoopbackFromEnv,
  limitByIp,
  LIMITS,
  rateLimitSettings,
} from "../lib/rate-limit.js";

// The loopback exemption (decision 067). On Render every request reaches
// Express from loopback, so the exemption must be off unless it is asked for.
// Supertest connects from 127.0.0.1, which is exactly the Render case.

const testDefault = rateLimitSettings.exemptLoopback;

afterEach(() => {
  rateLimitSettings.exemptLoopback = testDefault;
});

function limitedApp() {
  setStoreForTests(new MemoryStore());
  const small = express();
  small.post("/login", limitByIp("login"), (_req, res) => {
    res.json({ ok: true });
  });
  return small;
}

async function statusesFor(count: number) {
  const small = limitedApp();
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    statuses.push((await request(small).post("/login")).status);
  }
  return statuses;
}

describe("RATE_LIMIT_EXEMPT_LOOPBACK", () => {
  it("is on only for exactly 'true' (missing or anything else means limits apply)", () => {
    expect(exemptLoopbackFromEnv(undefined)).toBe(false);
    expect(exemptLoopbackFromEnv("")).toBe(false);
    expect(exemptLoopbackFromEnv("false")).toBe(false);
    expect(exemptLoopbackFromEnv("1")).toBe(false);
    expect(exemptLoopbackFromEnv("yes")).toBe(false);
    expect(exemptLoopbackFromEnv("TRUE")).toBe(false);
    expect(exemptLoopbackFromEnv("true")).toBe(true);
    expect(exemptLoopbackFromEnv(" true\n")).toBe(true); // stray spaces from copying
  });

  it("is turned on for the tests by jest.setup-env.js", () => {
    expect(testDefault).toBe(true);
  });

  it("not set (like Render): a loopback connection IS limited", async () => {
    rateLimitSettings.exemptLoopback = exemptLoopbackFromEnv(undefined);
    const { limit } = LIMITS.login;
    const statuses = await statusesFor(limit + 1);

    expect(statuses.slice(0, limit).every((s) => s === 200)).toBe(true);
    expect(statuses[limit]).toBe(429);
  });

  it("set to true (local development): a loopback connection is not limited", async () => {
    rateLimitSettings.exemptLoopback = exemptLoopbackFromEnv("true");
    const statuses = await statusesFor(LIMITS.login.limit + 5);

    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});
