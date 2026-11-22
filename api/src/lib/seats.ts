import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";

// Either the normal client or the client inside a transaction (tx). The
// booking route counts seats INSIDE its transaction, while the event row is
// locked, so it must be able to pass its tx here.
type Db = Prisma.TransactionClient;

// Seats left = seatLimit − seats taken (decision 005: calculated, not stored).
//
// This is the ONLY place that decides what "taken" means. The event list,
// the event page and the booking check all use it, so they can never
// disagree.
//
// Taken = CONFIRMED bookings + HELD bookings whose hold hasn't expired yet.
// It adds up `seats` (a 2-seat booking takes 2), it doesn't count bookings.
// A HELD booking with no expiry time shouldn't exist (decision 008); if one
// does, it counts as taken: showing one seat too few is safer than selling
// a seat twice.
export function takenWhere(now: Date): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: "CONFIRMED" },
      {
        status: "HELD",
        OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
      },
    ],
  };
}

export async function seatsTakenByEvent(
  eventIds: string[],
  { now = new Date(), db = prisma }: { now?: Date; db?: Db } = {},
): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();

  // One query for all the events, grouped by event: no N+1
  // (not one query per event in the list)
  const rows = await db.booking.groupBy({
    by: ["eventId"],
    where: { eventId: { in: eventIds }, ...takenWhere(now) },
    _sum: { seats: true },
  });

  return new Map(rows.map((row) => [row.eventId, row._sum.seats ?? 0]));
}

// Adds seatsLeft to each event, using the calculation above
export async function withSeatsLeft<
  E extends { id: string; seatLimit: number },
>(events: E[]): Promise<(E & { seatsLeft: number })[]> {
  const taken = await seatsTakenByEvent(events.map((event) => event.id));
  return events.map((event) => ({
    ...event,
    seatsLeft: event.seatLimit - (taken.get(event.id) ?? 0),
  }));
}
