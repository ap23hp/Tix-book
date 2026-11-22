// LAB SCRIPT (phase 4b): measure pessimistic vs optimistic locking.
// Run: npm run lab:locking   (dev database only, see the guard below)
//
// Two scenarios, each with both strategies and a few rounds: a fresh event,
// then REQUESTS simultaneous 1-seat bookings.
// - "mostly sold out": 10 seats, so most requests should be refused
// - "room for everyone": 40 seats, so every request should get one Prints how many got a seat, how many were
// refused, how many extra attempts optimistic needed, and how long it took.
// It deletes everything it created at the end.

import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { holdSeats } from "../lib/bookings.js";
import { holdSeatsOptimistic } from "./optimistic-booking.js";

const SCENARIOS = [
  { name: "mostly sold out", seats: 10 },
  { name: "room for everyone", seats: 40 },
];
const REQUESTS = 40;
const ROUNDS = 3;
const PREFIX = "lab-bench-";

// Same guard as the seed: only run against the dev database host
function assertDevDatabase() {
  const url = process.env.DATABASE_URL;
  const allowed = process.env.SEED_ALLOWED_HOST;
  if (!url || !allowed || new URL(url).hostname !== allowed) {
    throw new Error(
      "Refusing to run: DATABASE_URL's host must match SEED_ALLOWED_HOST (the dev database).",
    );
  }
}

type Strategy = "pessimistic" | "optimistic";

async function runRound(
  strategy: Strategy,
  seats: number,
  organiserId: string,
  userId: string,
) {
  const event = await prisma.event.create({
    data: {
      title: `${PREFIX}${strategy}`,
      description: "Locking benchmark",
      category: "Music",
      format: "ONLINE",
      meetingLink: "https://example.com/meet",
      status: "PUBLISHED",
      startsAt: new Date("2032-01-01T19:00:00Z"),
      endsAt: new Date("2032-01-01T21:00:00Z"),
      timezone: "Europe/London",
      pricePence: 1000,
      seatLimit: seats,
      organiserId,
    },
  });

  const started = performance.now();
  const results = await Promise.allSettled(
    Array.from({ length: REQUESTS }, async () => {
      if (strategy === "pessimistic") {
        await holdSeats({
          eventId: event.id,
          userId,
          seats: 1,
          idempotencyKey: randomUUID(),
        });
        return 1;
      }
      return (
        await holdSeatsOptimistic({ eventId: event.id, userId, seats: 1 })
      ).attempts;
    }),
  );
  const ms = Math.round(performance.now() - started);

  const booked = results.filter((r) => r.status === "fulfilled");
  const refused = results.filter(
    (r) =>
      r.status === "rejected" &&
      (r.reason as { status?: number }).status === 409,
  ).length;
  const failed = REQUESTS - booked.length - refused; // errors other than "sold out"
  const extraAttempts = booked.reduce(
    (sum, r) => sum + (r as PromiseFulfilledResult<number>).value - 1,
    0,
  );
  const taken = await prisma.booking.count({ where: { eventId: event.id } });

  return { booked: booked.length, refused, failed, extraAttempts, taken, ms };
}

async function main() {
  assertDevDatabase();
  const runId = Date.now();
  const organiser = await prisma.user.create({
    data: {
      name: "Bench organiser",
      email: `${PREFIX}org-${runId}@example.com`,
      role: "ORGANISER",
    },
  });
  const user = await prisma.user.create({
    data: {
      name: "Bench attendee",
      email: `${PREFIX}att-${runId}@example.com`,
      role: "ATTENDEE",
    },
  });

  try {
    for (const scenario of SCENARIOS) {
      console.log(
        `
${scenario.name}: ${REQUESTS} simultaneous 1-seat bookings for ${scenario.seats} seats`,
      );
      for (const strategy of ["pessimistic", "optimistic"] as const) {
        for (let round = 1; round <= ROUNDS; round++) {
          const r = await runRound(
            strategy,
            scenario.seats,
            organiser.id,
            user.id,
          );
          console.log(
            `  ${strategy.padEnd(11)} round ${round}: booked ${r.booked}, sold out ${r.refused}, ` +
              `other errors ${r.failed}, rows saved ${r.taken}, extra attempts ${r.extraAttempts}, ${r.ms} ms`,
          );
        }
      }
    }
  } finally {
    // Clean up everything this script made
    await prisma.booking.deleteMany({
      where: { event: { organiser: { email: { startsWith: PREFIX } } } },
    });
    await prisma.event.deleteMany({
      where: { organiser: { email: { startsWith: PREFIX } } },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
