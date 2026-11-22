import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { prisma } from "../lib/prisma.js";
import { holdSeatsOptimistic } from "../lab/optimistic-booking.js";

// Phase 4b lab: the optimistic version must be just as safe as the
// pessimistic one the API uses (decision 034, compared in decision 038).

const runId = Date.now();
const PREFIX = "lab-test-";
let organiserId = "";
let userId = "";

async function makeEvent(seatLimit: number) {
  return prisma.event.create({
    data: {
      title: "Locking lab event",
      description: "Created by a test",
      category: "Music",
      format: "ONLINE",
      meetingLink: "https://example.com/meet",
      status: "PUBLISHED",
      startsAt: new Date("2031-12-01T19:00:00Z"),
      endsAt: new Date("2031-12-01T21:00:00Z"),
      timezone: "Europe/London",
      pricePence: 1000,
      seatLimit,
      organiserId,
    },
  });
}

async function takenSeats(eventId: string) {
  const sum = await prisma.booking.aggregate({
    where: { eventId, status: { in: ["HELD", "CONFIRMED"] } },
    _sum: { seats: true },
  });
  return sum._sum.seats ?? 0;
}

beforeAll(async () => {
  organiserId = (
    await prisma.user.create({
      data: {
        name: "Lab organiser",
        email: `${PREFIX}organiser-${runId}@example.com`,
        role: "ORGANISER",
      },
    })
  ).id;
  userId = (
    await prisma.user.create({
      data: {
        name: "Lab attendee",
        email: `${PREFIX}attendee-${runId}@example.com`,
        role: "ATTENDEE",
      },
    })
  ).id;
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

describe("Optimistic locking (lab)", () => {
  it("books when nobody else is booking (first attempt)", async () => {
    const event = await makeEvent(5);
    const { booking, attempts } = await holdSeatsOptimistic({
      eventId: event.id,
      userId,
      seats: 2,
    });
    expect(booking.status).toBe("HELD");
    expect(attempts).toBe(1);
  });

  it("never oversells: 15 simultaneous requests for 5 seats", async () => {
    const event = await makeEvent(5);

    const results = await Promise.allSettled(
      Array.from({ length: 15 }, () =>
        holdSeatsOptimistic({ eventId: event.id, userId, seats: 1 }),
      ),
    );

    const booked = results.filter((r) => r.status === "fulfilled");
    expect(booked).toHaveLength(5);
    expect(await takenSeats(event.id)).toBe(5);

    // The losers were refused as sold out, not left hanging
    for (const r of results) {
      if (r.status === "rejected") {
        expect((r.reason as { status?: number }).status).toBe(409);
      }
    }

    // Under contention, some requests needed more than one attempt
    const attempts = booked.map(
      (r) => (r as PromiseFulfilledResult<{ attempts: number }>).value.attempts,
    );
    expect(Math.max(...attempts)).toBeGreaterThan(1);
  });
});
