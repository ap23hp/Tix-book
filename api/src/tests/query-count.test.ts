import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createSession, SESSION_COOKIE } from "../lib/session.js";
import { newReference } from "../lib/bookings.js";

// The N+1 check (decision 071): a list page must make the SAME number of
// SQL queries for 1 row as for 10. An N+1 bug (one extra query per row,
// e.g. looking up each booking's event in a loop) would make 10 rows cost
// 9 more queries than 1 row. Prisma emits a "query" event per SQL query in
// tests (lib/prisma.ts), so we count them around one request.

const runId = Date.now();
const PREFIX = "querycount-test-";
const DAY = 24 * 60 * 60_000;

let queries = 0;
prisma.$on("query", () => {
  queries++;
});

async function countQueries(run: () => Promise<unknown>): Promise<number> {
  queries = 0;
  await run();
  return queries;
}

async function makeUser(label: string, role: "ATTENDEE" | "ORGANISER") {
  const user = await prisma.user.create({
    data: {
      name: `Query count ${label}`,
      email: `${PREFIX}${label}-${runId}@example.com`,
      role,
    },
  });
  const { token } = await createSession(user.id);
  return { id: user.id, cookie: `${SESSION_COOKIE}=${token}` };
}

async function makeEvent(organiserId: string, title: string) {
  const startsAt = new Date(Date.now() + 10 * DAY);
  return prisma.event.create({
    data: {
      title,
      description: "For the query count tests",
      category: "Tech",
      format: "ONLINE",
      status: "PUBLISHED",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60_000),
      timezone: "Europe/London",
      meetingLink: "https://example.com/meet",
      pricePence: 0,
      seatLimit: 100,
      organiserId,
    },
  });
}

async function book(userId: string, eventId: string) {
  await prisma.booking.create({
    data: {
      userId,
      eventId,
      seats: 1,
      status: "CONFIRMED",
      unitPricePence: 0,
      reference: newReference(),
      idempotencyKey: randomUUID(),
    },
  });
}

// "One" and "ten": the same shape of data, only the number of rows differs
const one = {
  organiser: { id: "", cookie: "" },
  attendee: { id: "", cookie: "" },
  eventId: "",
};
const ten = { ...one };
const tag = `qc${runId}`;

beforeAll(async () => {
  for (const [side, count] of [
    [one, 1],
    [ten, 10],
  ] as const) {
    side.organiser = await makeUser(`organiser-${count}`, "ORGANISER");
    side.attendee = await makeUser(`attendee-${count}`, "ATTENDEE");
    for (let i = 0; i < count; i++) {
      const event = await makeEvent(side.organiser.id, `${tag}-${count} ${i}`);
      await book(side.attendee.id, event.id);
      if (i === 0) side.eventId = event.id;
    }
    // The dashboard's first event gets `count` bookings in all
    for (let i = 1; i < count; i++) {
      const extra = await makeUser(`extra-${count}-${i}`, "ATTENDEE");
      await book(extra.id, side.eventId);
    }
  }
});

afterAll(async () => {
  const mine = { email: { startsWith: PREFIX } };
  await prisma.booking.deleteMany({ where: { user: mine } });
  await prisma.event.deleteMany({ where: { organiser: mine } });
  await prisma.user.deleteMany({ where: mine });
  await prisma.$disconnect();
});

describe("list pages make the same number of queries for 1 row or 10 (no N+1)", () => {
  it("My tickets: GET /bookings/mine", async () => {
    const get = (side: typeof one) => () =>
      request(app)
        .get("/api/v1/bookings/mine")
        .set("Cookie", side.attendee.cookie)
        .expect(200);
    const res = await request(app)
      .get("/api/v1/bookings/mine")
      .set("Cookie", ten.attendee.cookie);
    expect(res.body.bookings).toHaveLength(10);
    const forOne = await countQueries(get(one));
    const forTen = await countQueries(get(ten));
    expect(forOne).toBeGreaterThan(0);
    expect(forTen).toBe(forOne);
  });

  it("organiser's events: GET /events/mine", async () => {
    const get = (side: typeof one) => () =>
      request(app)
        .get("/api/v1/events/mine?limit=20")
        .set("Cookie", side.organiser.cookie)
        .expect(200);
    const res = await request(app)
      .get("/api/v1/events/mine?limit=20")
      .set("Cookie", ten.organiser.cookie);
    expect(res.body.events).toHaveLength(10);
    const forOne = await countQueries(get(one));
    const forTen = await countQueries(get(ten));
    expect(forTen).toBe(forOne);
  });

  it("organiser bookings: GET /events/mine/:id/bookings", async () => {
    const get = (side: typeof one) => () =>
      request(app)
        .get(`/api/v1/events/mine/${side.eventId}/bookings`)
        .set("Cookie", side.organiser.cookie)
        .expect(200);
    const res = await request(app)
      .get(`/api/v1/events/mine/${ten.eventId}/bookings`)
      .set("Cookie", ten.organiser.cookie);
    expect(res.body.bookings).toHaveLength(10);
    const forOne = await countQueries(get(one));
    const forTen = await countQueries(get(ten));
    expect(forTen).toBe(forOne);
  });

  it("public search with seats left: GET /events?q=", async () => {
    // A search isn't cached, so every request reaches the database
    const get = (count: number) => () =>
      request(app).get(`/api/v1/events?q=${tag}-${count}&limit=20`).expect(200);
    const res = await request(app).get(`/api/v1/events?q=${tag}-10&limit=20`);
    expect(res.body.events).toHaveLength(10);
    const forOne = await countQueries(get(1));
    const forTen = await countQueries(get(10));
    expect(forTen).toBe(forOne);
  });
});
