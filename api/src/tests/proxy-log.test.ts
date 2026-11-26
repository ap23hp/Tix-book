import { describe, it, expect, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import app from "../app.js";
import {
  createProxyLogger,
  proxyArmedLine,
  PROXY_LIMIT_REACHED_LINE,
  PROXY_LOG_LIMIT,
} from "../lib/proxy-log.js";

// The "[proxy]" log (decisions 064, 066). Each test makes its own logger
// with a fake log function, so lines can be counted without touching console.

function appWithLogger(limit: number) {
  const lines: string[] = [];
  const small = express();
  small.use(
    "/api",
    createProxyLogger({
      limit,
      log: (line) => lines.push(line),
      trustProxy: () => 0,
    }),
  );
  small.get("/api/ping", (_req, res) => {
    res.json({ ok: true });
  });
  small.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  return { small, lines };
}

describe("[proxy] log", () => {
  it("says at startup that it is armed, and for how many requests", () => {
    expect(PROXY_LOG_LIMIT).toBe(5);
    expect(proxyArmedLine()).toBe("[proxy] log armed for 5 /api requests");
  });

  it("logs counts and yes/no only, never an address", async () => {
    const { small, lines } = appWithLogger(5);
    await request(small)
      .get("/api/ping")
      .set("X-Forwarded-For", "203.0.113.7, 198.51.100.2")
      .set("X-Vercel-Id", "lhr1::abc")
      .expect(200);

    expect(lines).toEqual([
      "[proxy] x-forwarded-for entries=2 via-vercel=true loopback=true trust-proxy=0",
    ]);
    expect(lines.join()).not.toContain("203.0.113.7");
  });

  it("logs the first N requests, then ONE limit line, then nothing", async () => {
    const { small, lines } = appWithLogger(2);
    for (let i = 0; i < 6; i++) {
      await request(small).get("/api/ping").expect(200);
    }

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\[proxy\] x-forwarded-for entries=0 /);
    expect(lines[1]).toMatch(/^\[proxy\] x-forwarded-for entries=0 /);
    expect(lines[2]).toBe(PROXY_LIMIT_REACHED_LINE);
    expect(PROXY_LIMIT_REACHED_LINE).toBe(
      "[proxy] limit reached, no more lines until restart",
    );
  });

  it("ignores requests outside /api (they don't use up the count)", async () => {
    const { small, lines } = appWithLogger(1);
    await request(small).get("/health").expect(200);
    expect(lines).toEqual([]);

    await request(small).get("/api/ping").expect(200);
    expect(lines).toHaveLength(1);
  });

  it("is wired into the real app: first middleware on /api, not on /health", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      // An unknown route still passes through it, before the 404 handler
      await request(app).get("/api/v1/no-such-route").expect(404);
      await request(app).get("/health").expect(200);

      const proxyLines = spy.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.startsWith("[proxy]"));
      expect(proxyLines).toEqual([
        "[proxy] x-forwarded-for entries=0 via-vercel=false loopback=true trust-proxy=0",
      ]);
    } finally {
      spy.mockRestore();
    }
  });
});
