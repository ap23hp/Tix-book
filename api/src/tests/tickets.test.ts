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
  organiserId = organiser.id,
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
      organiserId,
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

// Scan `code` (QR token or reference) at the door of event `eventId`
function verify(eventId: string, code: string, cookie = organiser.cookie) {
  return request(app)
    .post("/api/v1/tickets/verify")
    .set("Cookie", cookie)
    .send({ eventId, code });
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

describe("POST /api/v1/tickets/verify (check-in at the door)", () => {
  it("checks a real ticket in at the organiser's own event", async () => {
    const booking = await makeBooking();
    const response = await verify(booking.eventId, await ticketFor(booking.id));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: "valid",
      reference: booking.reference,
      seats: 2,
      checkedInAt: expect.any(String),
    });
    // Saved, so the next scan knows
    const saved = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(saved.checkedInAt?.toISOString()).toBe(response.body.checkedInAt);
  });

  it("says a ticket was already used, and when", async () => {
    const booking = await makeBooking();
    const token = await ticketFor(booking.id);
    const first = await verify(booking.eventId, token);
    const second = await verify(booking.eventId, token);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      result: "already_used",
      reference: booking.reference,
      seats: 2,
      checkedInAt: first.body.checkedInAt,
    });
  });

  it("lets only one of many scanners in when they scan the same ticket at once", async () => {
    const booking = await makeBooking();
    const token = await ticketFor(booking.id);
    // Warm up first: open 10 database connections with harmless scans.
    // Without this, the first scan spends ~200 ms opening a connection, the
    // others wait for theirs, and the first finishes alone: the test then
    // passed even with the race-safe WHERE removed (a deliberate break).
    await Promise.all(
      Array.from({ length: 10 }, () => verify(booking.eventId, "warm-up")),
    );
    // 10 scans at the same moment (two doors, a double tap, a retry...)
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => verify(booking.eventId, token)),
    );
    const results = responses.map((r) => r.body.result);
    expect(results.filter((r) => r === "valid")).toHaveLength(1);
    expect(results.filter((r) => r === "already_used")).toHaveLength(9);
    // Everyone agrees on when it was used: the winner's time
    const winner = responses.find((r) => r.body.result === "valid")!;
    for (const r of responses) {
      expect(r.body.checkedInAt).toBe(winner.body.checkedInAt);
    }
  });

  it("accepts the booking reference instead of the QR code, typed loosely", async () => {
    const booking = await makeBooking();
    const typed = `  ${booking.reference.toLowerCase()} `;
    const response = await verify(booking.eventId, typed);
    expect(response.body).toMatchObject({
      result: "valid",
      reference: booking.reference,
    });
    // The same booking, so its QR code is now used too
    const again = await verify(booking.eventId, await ticketFor(booking.id));
    expect(again.body.result).toBe("already_used");
  });

  it("says wrong event for a ticket or reference from another of my events", async () => {
    const atThisDoor = await makeBooking();
    const forElsewhere = await makeBooking();
    const byQr = await verify(
      atThisDoor.eventId,
      await ticketFor(forElsewhere.id),
    );
    expect(byQr.body).toEqual({ result: "wrong_event" });
    const byReference = await verify(
      atThisDoor.eventId,
      forElsewhere.reference,
    );
    expect(byReference.body).toEqual({ result: "wrong_event" });
    // Not checked in by the wrong door
    const saved = await prisma.booking.findUniqueOrThrow({
      where: { id: forElsewhere.id },
    });
    expect(saved.checkedInAt).toBeNull();
  });

  it("doesn't confirm another organiser's booking reference exists", async () => {
    const mine = await makeBooking();
    const theirs = await makeBooking("CONFIRMED", undefined, otherOrganiser.id);
    const response = await verify(mine.eventId, theirs.reference);
    expect(response.body).toEqual({ result: "invalid", reason: "invalid" });
  });

  it("says invalid for an unknown reference or random text", async () => {
    const booking = await makeBooking();
    for (const code of ["TIX-AAAAAAAA", "hello"]) {
      expect((await verify(booking.eventId, code)).body).toEqual({
        result: "invalid",
        reason: "invalid",
      });
    }
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
    const response = await verify(booking.eventId, forged);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ result: "invalid", reason: "invalid" });
  });

  it("refuses a ticket whose seats were edited (signature no longer matches)", async () => {
    const booking = await makeBooking();
    const [header, payload, signature] = (await ticketFor(booking.id)).split(
      ".",
    );
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
    const edited = `${header}.${b64({ ...claims, seats: 10 })}.${signature}`;
    expect((await verify(booking.eventId, edited)).body.result).toBe("invalid");
  });

  it('refuses an unsigned token ("alg": "none")', async () => {
    const booking = await makeBooking();
    const claims = decodeJwt(await ticketFor(booking.id));
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.`;
    expect((await verify(booking.eventId, unsigned)).body.result).toBe(
      "invalid",
    );
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
    expect((await verify(booking.eventId, other)).body.result).toBe("invalid");
  });

  it("says an old ticket has expired", async () => {
    // An event that ended 2 days ago: its ticket ran out yesterday
    const booking = await makeBooking(
      "CONFIRMED",
      new Date(Date.now() - 2 * 24 * 3_600_000),
    );
    const response = await verify(booking.eventId, await ticketFor(booking.id));
    expect(response.body).toEqual({ result: "invalid", reason: "expired" });
  });

  it.each(["REFUNDED", "CANCELLED"] as const)(
    "refuses a correctly signed ticket whose booking was %s since",
    async (status) => {
      const booking = await makeBooking();
      const token = await ticketFor(booking.id);
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status },
      });
      const response = await verify(booking.eventId, token);
      expect(response.body).toEqual({
        result: "no_longer_valid",
        reference: booking.reference,
        bookingStatus: status.toLowerCase(),
      });
      const saved = await prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
      });
      expect(saved.checkedInAt).toBeNull();
    },
  );

  it("refuses the reference of a booking that was never paid (held)", async () => {
    const booking = await makeBooking("HELD");
    const response = await verify(booking.eventId, booking.reference);
    expect(response.body).toMatchObject({
      result: "no_longer_valid",
      bookingStatus: "held",
    });
  });

  it("returns 404 at another organiser's door or an unknown event, 403 to an attendee", async () => {
    const booking = await makeBooking();
    const token = await ticketFor(booking.id);
    expect(
      (await verify(booking.eventId, token, otherOrganiser.cookie)).status,
    ).toBe(404);
    expect((await verify(booking.eventId, token, attendee.cookie)).status).toBe(
      403,
    );
    expect((await verify(randomUUID(), token)).status).toBe(404);
    // None of those checked it in
    const saved = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(saved.checkedInAt).toBeNull();
  });

  it("returns 400 without a code or an event", async () => {
    const booking = await makeBooking();
    expect((await verify(booking.eventId, "   ")).status).toBe(400);
    const noEvent = await request(app)
      .post("/api/v1/tickets/verify")
      .set("Cookie", organiser.cookie)
      .send({ code: "TIX-AAAAAAAA" });
    expect(noEvent.status).toBe(400);
  });
});
