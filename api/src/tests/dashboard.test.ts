import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createSession, SESSION_COOKIE } from "../lib/session.js";
import { newReference } from "../lib/bookings.js";

const runId = Date.now();
const PREFIX = "dashboard-test-";

async function makeUser(label: string, role: "ATTENDEE" | "ORGANISER") {
  const user = await prisma.user.create({
    data: {
      name: `Dashboard ${label}`,
      email: `${PREFIX}${label}-${runId}@example.com`,
      role,
    },
  });
  const { token } = await createSession(user.id);
  return { id: user.id, cookie: `${SESSION_COOKIE}=${token}` };
}

let organiser = { id: "", cookie: "" };
let otherOrganiser = { id: "", cookie: "" };
let attendee = { id: "", cookie: "" };
let eventId = "";

// Minutes from now: negative = in the past
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000);

async function addBooking(
  status: "HELD" | "CONFIRMED" | "REFUNDED",
  seats: number,
  { unitPricePence = 1500, holdMinutes = 5, createdMinutesAgo = 0 } = {},
) {
  return prisma.booking.create({
    data: {
      eventId,
      userId: attendee.id,
      seats,
      status,
      unitPricePence,
      holdExpiresAt: inMinutes(holdMinutes),
      reference: newReference(),
      idempotencyKey: randomUUID(),
      createdAt: inMinutes(-createdMinutesAgo),
    },
  });
}

function dashboard(id: string, cookie = organiser.cookie) {
  return request(app)
    .get(`/api/v1/events/mine/${id}/bookings`)
    .set("Cookie", cookie);
}

beforeAll(async () => {
  organiser = await makeUser("organiser", "ORGANISER");
  otherOrganiser = await makeUser("other-organiser", "ORGANISER");
  attendee = await makeUser("attendee", "ATTENDEE");
  const event = await prisma.event.create({
    data: {
      title: `Dashboard test event ${runId}`,
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
      organiserId: organiser.id,
    },
  });
  eventId = event.id;

  // Oldest first: 2 confirmed at £15, 1 confirmed at £10 (the price changed),
  // 3 on a running hold, 2 on a hold that ran out, 1 refunded
  await addBooking("CONFIRMED", 2, { createdMinutesAgo: 50 });
  await addBooking("CONFIRMED", 1, {
    unitPricePence: 1000,
    createdMinutesAgo: 40,
  });
  await addBooking("HELD", 3, { createdMinutesAgo: 1 });
  await addBooking("HELD", 2, { holdMinutes: -1, createdMinutesAgo: 30 });
  await addBooking("REFUNDED", 1, { createdMinutesAgo: 20 });
});

afterAll(async () => {
  await prisma.booking.deleteMany({
    where: { event: { organiser: { email: { startsWith: PREFIX } } } },
  });
  await prisma.event.deleteMany({
    where: { organiser: { email: { startsWith: PREFIX } } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe("GET /api/v1/events/mine/:id/bookings (organiser dashboard)", () => {
  it("counts confirmed, held and left seats, and confirmed revenue", async () => {
    const response = await dashboard(eventId);
    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      seatsConfirmed: 3,
      seatsHeld: 3, // the hold that ran out doesn't count
      seatsLeft: 4, // 10 − 3 − 3
      revenuePence: 2 * 1500 + 1000, // refunded doesn't count
    });
    expect(response.body.event).toMatchObject({
      id: eventId,
      seatLimit: 10,
    });
  });

  it("agrees with the public event page on seats left", async () => {
    const [mine, publicPage] = await Promise.all([
      dashboard(eventId),
      request(app).get(`/api/v1/events/${eventId}`),
    ]);
    expect(mine.body.summary.seatsLeft).toBe(publicPage.body.seatsLeft);
  });

  it("lists every booking newest first, a run-out hold as EXPIRED", async () => {
    const response = await dashboard(eventId);
    const statuses = response.body.bookings.map(
      (b: { status: string; seats: number }) => `${b.status}:${b.seats}`,
    );
    expect(statuses).toEqual([
      "HELD:3",
      "REFUNDED:1",
      "EXPIRED:2",
      "CONFIRMED:1",
      "CONFIRMED:2",
    ]);
    expect(response.body.bookings[0]).toMatchObject({
      attendeeName: "Dashboard attendee",
      totalPence: 4500,
    });
    expect(response.body.hasMore).toBe(false);
  });

  it("shows attendees by name only: no emails, keys or payment ids", async () => {
    const body = JSON.stringify((await dashboard(eventId)).body);
    expect(body).not.toContain("@example.com");
    expect(body).not.toMatch(/idempotencyKey|stripe|userId|passwordHash/i);
  });

  it("returns 404 for another organiser's event, 403 for an attendee", async () => {
    expect((await dashboard(eventId, otherOrganiser.cookie)).status).toBe(404);
    expect((await dashboard(eventId, attendee.cookie)).status).toBe(403);
    expect(
      (await request(app).get(`/api/v1/events/mine/${eventId}/bookings`))
        .status,
    ).toBe(401);
  });
});

describe("GET /api/v1/events/mine (with seat numbers)", () => {
  it("gives each event its confirmed, held and left seats, without revenue", async () => {
    const response = await request(app)
      .get("/api/v1/events/mine")
      .set("Cookie", organiser.cookie);
    const mine = response.body.events.find(
      (e: { id: string }) => e.id === eventId,
    );
    expect(mine).toMatchObject({
      seatsConfirmed: 3,
      seatsHeld: 3,
      seatsLeft: 4,
    });
    expect(mine).not.toHaveProperty("revenuePence");
  });

  it("doesn't count a hold that ran out, even while it's still stored as HELD", async () => {
    // The list doesn't save EXPIRED first (decision 035: the stored status
    // can lag), so the count itself must look at the hold's end time
    const event = await prisma.event.create({
      data: {
        title: `Dashboard lagging hold ${runId}`,
        description: "Created by a test",
        category: "Music",
        format: "ONLINE",
        meetingLink: "https://example.com/meet",
        status: "PUBLISHED",
        startsAt: new Date("2031-12-01T19:00:00Z"),
        endsAt: new Date("2031-12-01T21:00:00Z"),
        timezone: "Europe/London",
        pricePence: 1500,
        seatLimit: 5,
        organiserId: organiser.id,
      },
    });
    await prisma.booking.create({
      data: {
        eventId: event.id,
        userId: attendee.id,
        seats: 2,
        status: "HELD",
        unitPricePence: 1500,
        holdExpiresAt: inMinutes(-1),
        reference: newReference(),
        idempotencyKey: randomUUID(),
      },
    });

    const response = await request(app)
      .get("/api/v1/events/mine")
      .set("Cookie", organiser.cookie);
    const mine = response.body.events.find(
      (e: { id: string }) => e.id === event.id,
    );
    expect(mine).toMatchObject({ seatsHeld: 0, seatsLeft: 5 });
  });
});
