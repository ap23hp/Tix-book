import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createSession, SESSION_COOKIE } from "../lib/session.js";
import { NO_STORE, PUBLIC_SHORT } from "../lib/cache-headers.js";

// Decision 072: only public GETs may be kept by Vercel's CDN, briefly;
// everything else (anything about the logged-in user, errors, writes) says
// private, no-store.

const runId = Date.now();
const PREFIX = "cachehdr-test-";
let eventId = "";
let cookie = "";

beforeAll(async () => {
  const organiser = await prisma.user.create({
    data: {
      name: "Cache header organiser",
      email: `${PREFIX}organiser-${runId}@example.com`,
      role: "ORGANISER",
    },
  });
  const startsAt = new Date(Date.now() + 5 * 24 * 60 * 60_000);
  const event = await prisma.event.create({
    data: {
      title: `${PREFIX}${runId} event`,
      description: "For the cache header tests",
      category: "Tech",
      format: "ONLINE",
      status: "PUBLISHED",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      timezone: "Europe/London",
      meetingLink: "https://example.com/meet",
      pricePence: 0,
      seatLimit: 10,
      organiserId: organiser.id,
    },
  });
  eventId = event.id;
  cookie = `${SESSION_COOKIE}=${(await createSession(organiser.id)).token}`;
});

afterAll(async () => {
  const mine = { email: { startsWith: PREFIX } };
  await prisma.event.deleteMany({ where: { organiser: mine } });
  await prisma.user.deleteMany({ where: mine });
  await prisma.$disconnect();
});

describe("Cache-Control on the API", () => {
  it("public GETs: a short CDN cache, never kept by the browser", async () => {
    expect(PUBLIC_SHORT).toBe(
      "public, max-age=0, s-maxage=5, stale-while-revalidate=25",
    );
    for (const path of [
      "/api/v1/events",
      `/api/v1/events?q=${PREFIX}${runId}`,
      `/api/v1/events/${eventId}`,
    ]) {
      const res = await request(app).get(path).expect(200);
      expect(res.headers["cache-control"]).toBe(PUBLIC_SHORT);
    }
  });

  it("anything about the logged-in user is private, no-store", async () => {
    for (const path of [
      "/api/v1/events/mine",
      `/api/v1/events/mine/${eventId}`,
      `/api/v1/events/mine/${eventId}/bookings`,
      "/api/v1/bookings/mine",
    ]) {
      const res = await request(app)
        .get(path)
        .set("Cookie", cookie)
        .expect(200);
      expect(res.headers["cache-control"]).toBe(NO_STORE);
    }
  });

  it("errors are never cached, even on a public route", async () => {
    const missing = await request(app)
      .get("/api/v1/events/00000000-0000-0000-0000-000000000000")
      .expect(404);
    expect(missing.headers["cache-control"]).toBe(NO_STORE);
    const bad = await request(app).get("/api/v1/events?limit=500").expect(400);
    expect(bad.headers["cache-control"]).toBe(NO_STORE);
    const notLoggedIn = await request(app).get("/api/v1/auth/me").expect(401);
    expect(notLoggedIn.headers["cache-control"]).toBe(NO_STORE);
    const unknown = await request(app).get("/api/v1/nothing-here").expect(404);
    expect(unknown.headers["cache-control"]).toBe(NO_STORE);
  });

  it("writes are no-store", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie)
      .set("Sec-Fetch-Site", "same-origin");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });
});
