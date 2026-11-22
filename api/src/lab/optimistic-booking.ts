// LAB CODE: not used by the API. Phase 4b compares this optimistic version
// with the pessimistic one the API uses (lib/bookings.ts, decision 034).
// See DECISIONS 038 for the measured result.

import { randomUUID } from "node:crypto";
import type { Booking } from "../generated/prisma/client.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { HOLD_MINUTES, newReference } from "../lib/bookings.js";
import { seatsTakenByEvent } from "../lib/seats.js";

// Thrown inside the transaction when someone else changed the event first;
// it rolls the attempt back so we can try again
class VersionConflict extends Error {}

const MAX_ATTEMPTS = 20;

export type OptimisticResult = { booking: Booking; attempts: number };

// Optimistic locking: no lock while reading. Remember the event's version,
// count the seats, and save only if the version is still the same. If
// another booking got in first, the version has changed: start again.
//
// The version here is the event's `updatedAt` (a real implementation would
// add an integer `version` column; this avoids a schema change for a lab).
export async function holdSeatsOptimistic(input: {
  eventId: string;
  userId: string;
  seats: number;
}): Promise<OptimisticResult> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const booking = await prisma.$transaction(async (tx) => {
        // 1. Read without locking, and remember the version
        const event = await tx.event.findUnique({
          where: { id: input.eventId },
        });
        if (!event || event.status !== "PUBLISHED") {
          throw new HttpError(404, "Event not found");
        }
        const version = event.updatedAt;
        const now = new Date();

        // 2. Count with the same rule as everywhere else
        const taken =
          (await seatsTakenByEvent([event.id], { now, db: tx })).get(
            event.id,
          ) ?? 0;
        if (input.seats > event.seatLimit - taken) {
          throw new HttpError(409, "Sold out");
        }

        // 3. Save only if nobody changed the event since step 1: move the
        // version on, but only where it's still the one we read. 0 rows
        // updated = someone else booked in between → conflict.
        const { count } = await tx.event.updateMany({
          where: { id: event.id, updatedAt: version },
          data: { updatedAt: new Date() },
        });
        if (count === 0) throw new VersionConflict();

        return tx.booking.create({
          data: {
            eventId: event.id,
            userId: input.userId,
            seats: input.seats,
            unitPricePence: event.pricePence,
            idempotencyKey: randomUUID(),
            reference: newReference(),
            status: "HELD",
            holdExpiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000),
          },
        });
      });
      return { booking, attempts: attempt };
    } catch (err) {
      if (!(err instanceof VersionConflict)) throw err;
      // Wait a little, a different amount each time, so the requests that
      // just clashed don't all try again at the same moment
      await new Promise((r) => setTimeout(r, Math.random() * 20 * attempt));
    }
  }
  throw new HttpError(503, "Too busy, please try again");
}
