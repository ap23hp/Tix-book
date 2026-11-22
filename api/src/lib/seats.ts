import { prisma } from "./prisma.js";

// Seats left = seatLimit − seats taken (decision 005: calculated, not stored).
//
// This is the ONLY place that decides what "taken" means. The event list and
// the event page both call it, so they can never show different numbers.
//
// Taken = CONFIRMED bookings + HELD bookings whose hold hasn't expired yet.
// It adds up `seats` (a 2-seat booking takes 2), it doesn't count bookings.
// A HELD booking with no expiry time shouldn't exist (decision 008); if one
// does, it counts as taken: showing one seat too few is safer than selling
// a seat twice.
export async function seatsTakenByEvent(
  eventIds: string[],
  now: Date = new Date(),
): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();

  // One query for all the events, grouped by event: no N+1
  // (not one query per event in the list)
  const rows = await prisma.booking.groupBy({
    by: ["eventId"],
    where: {
      eventId: { in: eventIds },
      OR: [
        { status: "CONFIRMED" },
        {
          status: "HELD",
          OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
        },
      ],
    },
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
