import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { decodeJwt, SignJWT } from "jose";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createSession, SESSION_COOKIE } from "../lib/session.js";
import { newReference } from "../lib/bookings.js";

const runId = Date.now();
const PREFIX = "tickets-test-";
// Test-only value; the real secret lives in api/.env and on Render
const SECRET = "test-only-ticket-secret-not-used-anywhere-else";

async function makeUser(label: string, role: "ATTENDEE" | "ORGANISER") {
  const user = await prisma.user.create({
    data: {
      name: `Tickets ${label}`,
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

async function makeBooking(
  status: "HELD" | "CONFIRMED" = "CONFIRMED",
  endsAt = new Date("2031-11-01T21:00:00Z"),
) {
  const event = await prisma.event.create({
    data: {
      title: "Tickets test event",
      description: "Created by a test",
      category: "Music",
      format: "ONLINE",
      meetingLink: "https://example.com/meet",
      status: "PUBLISHED",
      startsAt: new Date(endsAt.getTime() - 2 * 3_600_000),
      endsAt,
      timezone: "Europe/London",
      pricePence: 1500,
      seatLimit: 10,
      organiserId: organiser.id,
    },
  });
  return prisma.booking.create({
    data: {
      eventId: event.id,
      userId: attendee.id,
      seats: 2,
      status,
      unitPricePence: 1500,
      holdExpiresAt: new Date(Date.now() + 5 * 60_000),
      reference: newReference(),
      idempotencyKey: randomUUID(),
    },
  });
}

async function ticketFor(bookingId: string) {
  const response = await request(app)
    .get(`/api/v1/bookings/${bookingId}/ticket`)
    .set("Cookie", attendee.cookie);
  expect(response.status).toBe(200);
  return response.body.token as string;
}

function verify(token: string, cookie = organiser.cookie) {
  return request(app)
    .post("/api/v1/tickets/verify")
    .set("Cookie", cookie)
    .send({ token });
}

// A JWT is three base64url parts: header.payload.signature
function b64(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

beforeAll(async () => {
  process.env.TICKET_JWT_SECRET = SECRET;
  organiser = await makeUser("organiser", "ORGANISER");
  otherOrganiser = await makeUser("other-organiser", "ORGANISER");
  attendee = await makeUser("attendee", "ATTENDEE");
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

describe("GET /api/v1/bookings/:id/ticket", () => {
  it("gives my confirmed booking a signed ticket with no personal data", async () => {
    const booking = await makeBooking();
    const token = await ticketFor(booking.id);

    // Anyone can read a JWT without the secret, so check what's inside
    const claims = decodeJwt(token);
    expect(claims.sub).toBe(booking.id);
    expect(claims.ref).toBe(booking.reference);
    expect(claims.seats).toBe(2);
    expect(claims.aud).toBe("ticket");
    expect(JSON.stringify(claims)).not.toMatch(/@|Tickets attendee/);
    // Valid until a day after the event ends
    expect(claims.exp).toBe(
      Math.floor(new Date("2031-11-02T21:00:00Z").getTime() / 1000),
    );
  });

  it("refuses a booking that isn't confirmed (409)", async () => {
    const booking = await makeBooking("HELD");
    const response = await request(app)
      .get(`/api/v1/bookings/${booking.id}/ticket`)
      .set("Cookie", attendee.cookie);
    expect(response.status).toBe(409);
  });

  it("returns 404 for someone else's booking", async () => {
    const booking = await makeBooking();
    const response = await request(app)
      .get(`/api/v1/bookings/${booking.id}/ticket`)
      .set("Cookie", otherOrganiser.cookie);
    expect(response.status).toBe(404);
  });
});

describe("POST /api/v1/tickets/verify", () => {
  it("accepts a real ticket at the organiser's own event", async () => {
    const booking = await makeBooking();
    const response = await verify(await ticketFor(booking.id));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      valid: true,
      reference: booking.reference,
      seats: 2,
      event: { id: booking.eventId, title: "Tickets test event" },
    });
  });

  it("refuses a ticket signed with a different secret", async () => {
    const booking = await makeBooking();
    const forged = await new SignJWT({
      ref: booking.reference,
      evt: booking.eventId,
      seats: 2,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(booking.id)
      .setIssuer("tixbook")
      .setAudience("ticket")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-guessed-secret"));
    const response = await verify(forged);
    expect(response.status).toBe(422);
    expect(response.body.error).toBe("This is not a valid Tixbook ticket");
  });

  it("refuses a ticket whose seats were edited (signature no longer matches)", async () => {
    const booking = await makeBooking();
    const [header, payload, signature] = (await ticketFor(booking.id)).split(
      ".",
    );
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
    const edited = `${header}.${b64({ ...claims, seats: 10 })}.${signature}`;
    expect((await verify(edited)).status).toBe(422);
  });

  it('refuses an unsigned token ("alg": "none")', async () => {
    const booking = await makeBooking();
    const claims = decodeJwt(await ticketFor(booking.id));
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.`;
    expect((await verify(unsigned)).status).toBe(422);
  });

  it("refuses a token made for something else (wrong audience)", async () => {
    const booking = await makeBooking();
    const other = await new SignJWT({
      ref: booking.reference,
      evt: booking.eventId,
      seats: 2,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(booking.id)
      .setIssuer("tixbook")
      .setAudience("password-reset")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    expect((await verify(other)).status).toBe(422);
  });

  it("says an old ticket has expired", async () => {
    // An event that ended 2 days ago: its ticket ran out yesterday
    const booking = await makeBooking(
      "CONFIRMED",
      new Date(Date.now() - 2 * 24 * 3_600_000),
    );
    const response = await verify(await ticketFor(booking.id));
    expect(response.status).toBe(422);
    expect(response.body.error).toBe("This ticket has expired");
  });

  it("refuses a correctly signed ticket whose booking was refunded since", async () => {
    const booking = await makeBooking();
    const token = await ticketFor(booking.id);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "REFUNDED" },
    });
    const response = await verify(token);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe(
      "This ticket is no longer valid (booking refunded)",
    );
  });

  it("returns 404 to another organiser, and 403 to an attendee", async () => {
    const booking = await makeBooking();
    const token = await ticketFor(booking.id);
    expect((await verify(token, otherOrganiser.cookie)).status).toBe(404);
    expect((await verify(token, attendee.cookie)).status).toBe(403);
  });

  it("returns 400 without a token", async () => {
    const response = await request(app)
      .post("/api/v1/tickets/verify")
      .set("Cookie", organiser.cookie)
      .send({});
    expect(response.status).toBe(400);
  });
});
