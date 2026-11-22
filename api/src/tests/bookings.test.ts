import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createSession, SESSION_COOKIE } from "../lib/session.js";

const runId = Date.now();
const PREFIX = "bookings-test-";

// A user with a live session; returns the Cookie header value
async function makeUser(label: string, role: "ATTENDEE" | "ORGANISER") {
  const user = await prisma.user.create({
    data: {
      name: `Bookings ${label}`,
      email: `${PREFIX}${label}-${runId}@example.com`,
      role,
    },
  });
  const { token } = await createSession(user.id);
  return { id: user.id, cookie: `${SESSION_COOKIE}=${token}` };
}

let organiserId = "";
async function makeEvent(
  overrides: Partial<{
    title: string;
    seatLimit: number;
    pricePence: number;
    status: "DRAFT" | "PUBLISHED";
    startsAt: Date;
  }> = {},
) {
  return prisma.event.create({
    data: {
      title: "Bookings test event",
      description: "Created by a test",
      category: "Music",
      format: "ONLINE",
      meetingLink: "https://example.com/meet",
      status: "PUBLISHED",
      startsAt: new Date("2031-11-01T19:00:00Z"),
      endsAt: new Date("2031-11-01T21:00:00Z"),
      timezone: "Europe/London",
      pricePence: 1500,
      seatLimit: 10,
      organiserId,
      ...overrides,
    },
  });
}

function book(eventId: string, cookie: string, body: object) {
  return request(app)
    .post(`/api/v1/events/${eventId}/bookings`)
    .set("Cookie", cookie)
    .send(body);
}

let attendee = { id: "", cookie: "" };

beforeAll(async () => {
  organiserId = (await makeUser("organiser", "ORGANISER")).id;
  attendee = await makeUser("attendee", "ATTENDEE");
});

afterAll(async () => {
  // Bookings first, then events, then users (each points at the next)
  await prisma.booking.deleteMany({
    where: { event: { organiser: { email: { startsWith: PREFIX } } } },
  });
  await prisma.event.deleteMany({
    where: { organiser: { email: { startsWith: PREFIX } } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe("POST /api/v1/events/:id/bookings (hold seats)", () => {
  it("returns 401 when not logged in", async () => {
    const event = await makeEvent();
    const response = await request(app)
      .post(`/api/v1/events/${event.id}/bookings`)
      .send({ seats: 1, idempotencyKey: randomUUID() });
    expect(response.status).toBe(401);
  });

  it("returns 400 for a bad seat count or key", async () => {
    const event = await makeEvent();
    const tooMany = await book(event.id, attendee.cookie, {
      seats: 11,
      idempotencyKey: randomUUID(),
    });
    expect(tooMany.status).toBe(400);
    const badKey = await book(event.id, attendee.cookie, {
      seats: 1,
      idempotencyKey: "not-a-uuid",
    });
    expect(badKey.status).toBe(400);
  });

  it("holds seats on a paid event for 5 minutes", async () => {
    const event = await makeEvent({ pricePence: 1500 });
    const before = Date.now();
    const response = await book(event.id, attendee.cookie, {
      seats: 2,
      idempotencyKey: randomUUID(),
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "HELD",
      seats: 2,
      unitPricePence: 1500,
      totalPence: 3000,
    });
    expect(response.body.reference).toMatch(/^TIX-[A-Z2-9]{8}$/);
    const expiresIn = new Date(response.body.holdExpiresAt).getTime() - before;
    expect(expiresIn).toBeGreaterThan(4.5 * 60_000);
    expect(expiresIn).toBeLessThanOrEqual(5.1 * 60_000);
    // The meeting link is only for confirmed bookings
    expect(response.body.event.meetingLink).toBeNull();
    // Nothing private
    expect(response.body).not.toHaveProperty("idempotencyKey");

    // The held seats are taken
    const page = await request(app).get(`/api/v1/events/${event.id}`);
    expect(page.body.seatsLeft).toBe(8);
  });

  it("confirms a free event straight away (no hold)", async () => {
    const event = await makeEvent({ pricePence: 0 });
    const response = await book(event.id, attendee.cookie, {
      seats: 1,
      idempotencyKey: randomUUID(),
    });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("CONFIRMED");
    expect(response.body.holdExpiresAt).toBeNull();
    expect(response.body.event.meetingLink).toBe("https://example.com/meet");
  });

  it("refuses more seats than are left, then sold out", async () => {
    const event = await makeEvent({ seatLimit: 3 });
    const two = await book(event.id, attendee.cookie, {
      seats: 2,
      idempotencyKey: randomUUID(),
    });
    expect(two.status).toBe(201);

    const tooMany = await book(event.id, attendee.cookie, {
      seats: 2,
      idempotencyKey: randomUUID(),
    });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body).toEqual({ error: "Only 1 seat is left" });

    await book(event.id, attendee.cookie, {
      seats: 1,
      idempotencyKey: randomUUID(),
    });
    const soldOut = await book(event.id, attendee.cookie, {
      seats: 1,
      idempotencyKey: randomUUID(),
    });
    expect(soldOut.status).toBe(409);
    expect(soldOut.body).toEqual({ error: "Sold out" });
  });

  it("frees seats from expired holds, and marks those holds EXPIRED", async () => {
    const event = await makeEvent({ seatLimit: 2 });
    // A hold that ran out a minute ago, still stored as HELD
    const old = await prisma.booking.create({
      data: {
        eventId: event.id,
        userId: attendee.id,
        seats: 2,
        unitPricePence: 1500,
        status: "HELD",
        holdExpiresAt: new Date(Date.now() - 60_000),
        reference: `TEST-${runId}-expired`,
        idempotencyKey: randomUUID(),
      },
    });

    const response = await book(event.id, attendee.cookie, {
      seats: 2,
      idempotencyKey: randomUUID(),
    });
    expect(response.status).toBe(201);
    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: old.id },
    });
    expect(stored.status).toBe("EXPIRED");
  });

  it("returns 404 for drafts and unknown events", async () => {
    const draft = await makeEvent({ status: "DRAFT" });
    for (const id of [draft.id, "not-a-real-id"]) {
      const response = await book(id, attendee.cookie, {
        seats: 1,
        idempotencyKey: randomUUID(),
      });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Event not found" });
    }
  });

  it("returns 409 when the event has already started", async () => {
    const started = await makeEvent({
      startsAt: new Date(Date.now() - 60_000),
    });
    const response = await book(started.id, attendee.cookie, {
      seats: 1,
      idempotencyKey: randomUUID(),
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "This event has already started" });
  });
});

describe("Idempotency (decision 010)", () => {
  it("returns the same booking when the same key is sent again (200)", async () => {
    const event = await makeEvent();
    const key = randomUUID();
    const first = await book(event.id, attendee.cookie, {
      seats: 1,
      idempotencyKey: key,
    });
    const again = await book(event.id, attendee.cookie, {
      seats: 1,
      idempotencyKey: key,
    });

    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await prisma.booking.count({ where: { idempotencyKey: key } })).toBe(
      1,
    );
  });

  it("makes ONE booking when the same request arrives twice at the same moment", async () => {
    const event = await makeEvent();
    const key = randomUUID();
    const [a, b] = await Promise.all([
      book(event.id, attendee.cookie, { seats: 1, idempotencyKey: key }),
      book(event.id, attendee.cookie, { seats: 1, idempotencyKey: key }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.booking.count({ where: { idempotencyKey: key } })).toBe(
      1,
    );
  });

  it("returns 422 when a key is reused for a different booking", async () => {
    const event = await makeEvent();
    const key = randomUUID();
    await book(event.id, attendee.cookie, { seats: 1, idempotencyKey: key });
    const different = await book(event.id, attendee.cookie, {
      seats: 2,
      idempotencyKey: key,
    });
    expect(different.status).toBe(422);
  });
});

describe("GET /api/v1/bookings/:id and /mine", () => {
  let other = { id: "", cookie: "" };
  beforeAll(async () => {
    other = await makeUser("reader-other", "ATTENDEE");
  });

  it("returns 401 when not logged in", async () => {
    expect((await request(app).get("/api/v1/bookings/mine")).status).toBe(401);
  });

  it("returns my booking with the event and the server time", async () => {
    const event = await makeEvent({ title: "Readable event" });
    const held = await book(event.id, attendee.cookie, {
      seats: 1,
      idempotencyKey: randomUUID(),
    });

    const response = await request(app)
      .get(`/api/v1/bookings/${held.body.id}`)
      .set("Cookie", attendee.cookie);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("HELD");
    expect(response.body.event.title).toBe("Readable event");
    expect(typeof response.body.serverTime).toBe("string");
  });

  it("answers someone else's booking exactly like an unknown id (404)", async () => {
    const event = await makeEvent();
    const held = await book(event.id, attendee.cookie, {
      seats: 1,
      idempotencyKey: randomUUID(),
    });

    const others = await request(app)
      .get(`/api/v1/bookings/${held.body.id}`)
      .set("Cookie", other.cookie);
    const unknown = await request(app)
      .get("/api/v1/bookings/not-a-real-id")
      .set("Cookie", other.cookie);

    expect(others.status).toBe(404);
    expect(others.body).toEqual(unknown.body);
  });

  it("reports and saves a hold that ran out as EXPIRED", async () => {
    const event = await makeEvent();
    const old = await prisma.booking.create({
      data: {
        eventId: event.id,
        userId: attendee.id,
        seats: 1,
        unitPricePence: 1500,
        status: "HELD",
        holdExpiresAt: new Date(Date.now() - 1000),
        reference: `TEST-${runId}-read-expired`,
        idempotencyKey: randomUUID(),
      },
    });

    const response = await request(app)
      .get(`/api/v1/bookings/${old.id}`)
      .set("Cookie", attendee.cookie);
    expect(response.body.status).toBe("EXPIRED");
    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: old.id },
    });
    expect(stored.status).toBe("EXPIRED");
  });

  it("lists only my bookings, newest first", async () => {
    const event = await makeEvent();
    const mine = await book(event.id, other.cookie, {
      seats: 1,
      idempotencyKey: randomUUID(),
    });
    const newer = await book(event.id, other.cookie, {
      seats: 2,
      idempotencyKey: randomUUID(),
    });

    const response = await request(app)
      .get("/api/v1/bookings/mine")
      .set("Cookie", other.cookie);

    expect(response.status).toBe(200);
    expect(response.body.bookings.map((b: { id: string }) => b.id)).toEqual([
      newer.body.id,
      mine.body.id,
    ]);
  });
});

describe("POST /api/v1/bookings/:id/confirm", () => {
  function confirm(id: string, cookie: string) {
    return request(app)
      .post(`/api/v1/bookings/${id}/confirm`)
      .set("Cookie", cookie);
  }

  it("confirms my hold, shows the meeting link, and the seats stay taken", async () => {
    const event = await makeEvent({ seatLimit: 4 });
    const held = await book(event.id, attendee.cookie, {
      seats: 2,
      idempotencyKey: randomUUID(),
    });

    const response = await confirm(held.body.id, attendee.cookie);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("CONFIRMED");
    expect(response.body.event.meetingLink).toBe("https://example.com/meet");

    const page = await request(app).get(`/api/v1/events/${event.id}`);
    expect(page.body.seatsLeft).toBe(2);
  });

  it("answers a second confirm (double click) with the same booking", async () => {
    const event = await makeEvent();
    const held = await book(event.id, attendee.cookie, {
      seats: 1,
      idempotencyKey: randomUUID(),
    });
    await confirm(held.body.id, attendee.cookie);
    const again = await confirm(held.body.id, attendee.cookie);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe("CONFIRMED");
  });

  it("refuses an expired hold with 409", async () => {
    const event = await makeEvent();
    const old = await prisma.booking.create({
      data: {
        eventId: event.id,
        userId: attendee.id,
        seats: 1,
        unitPricePence: 1500,
        status: "HELD",
        holdExpiresAt: new Date(Date.now() - 1000),
        reference: `TEST-${runId}-confirm-expired`,
        idempotencyKey: randomUUID(),
      },
    });

    const response = await confirm(old.id, attendee.cookie);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "Your hold has expired and the seats were released",
    });
  });

  it("returns 404 for someone else's booking", async () => {
    const event = await makeEvent();
    const held = await book(event.id, attendee.cookie, {
      seats: 1,
      idempotencyKey: randomUUID(),
    });
    const stranger = await makeUser("confirm-stranger", "ATTENDEE");
    const response = await confirm(held.body.id, stranger.cookie);
    expect(response.status).toBe(404);
    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: held.body.id },
    });
    expect(stored.status).toBe("HELD");
  });
});

describe("Many people booking the last seats at the same moment", () => {
  // Sum of seats the database says are taken for an event
  async function heldSeats(eventId: string) {
    const sum = await prisma.booking.aggregate({
      where: { eventId, status: { in: ["HELD", "CONFIRMED"] } },
      _sum: { seats: true },
    });
    return sum._sum.seats ?? 0;
  }

  let people: { id: string; cookie: string }[] = [];
  beforeAll(async () => {
    people = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => makeUser(`crowd-${n}`, "ATTENDEE")),
    );
  });

  it("20 requests for 5 seats: exactly 5 succeed, nobody oversells", async () => {
    const event = await makeEvent({ seatLimit: 5 });

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        book(event.id, people[i % people.length]!.cookie, {
          seats: 1,
          idempotencyKey: randomUUID(),
        }),
      ),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 409)).toHaveLength(15);
    expect(await heldSeats(event.id)).toBe(5);
  });

  it("10 requests for 2 seats each, 5 seats: exactly 2 succeed (4 seats)", async () => {
    const event = await makeEvent({ seatLimit: 5 });

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        book(event.id, people[i % people.length]!.cookie, {
          seats: 2,
          idempotencyKey: randomUUID(),
        }),
      ),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(2);
    expect(await heldSeats(event.id)).toBe(4);
    // The last seat is still there for someone who wants one
    const page = await request(app).get(`/api/v1/events/${event.id}`);
    expect(page.body.seatsLeft).toBe(1);
  });
});
