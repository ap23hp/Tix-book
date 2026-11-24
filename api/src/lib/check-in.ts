import type { BookingStatus } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";
import { verifyTicket } from "./tickets.js";

// What the door scanner shows. Every scan that reached a decision is one of
// these (HTTP 200): "no entry" is a normal answer at the door, not a broken
// request (decision 055).
export type CheckInResult =
  | { result: "valid"; reference: string; seats: number; checkedInAt: Date }
  | {
      result: "already_used";
      reference: string;
      seats: number;
      checkedInAt: Date;
    }
  | {
      result: "no_longer_valid";
      reference: string;
      // refunded, cancelled, expired, held (never paid)
      bookingStatus: Lowercase<Exclude<BookingStatus, "CONFIRMED">>;
    }
  | { result: "wrong_event" }
  | { result: "invalid"; reason: "expired" | "invalid" };

// "TIX-7KQ2M9XA", typed or read out at the door (lib/bookings.ts makes them)
const REFERENCE = /^TIX-[A-Z0-9]{8}$/;

const INVALID: CheckInResult = { result: "invalid", reason: "invalid" };

// The booking a scanned code points at, or a result that ends the scan.
// `code` is either the ticket QR code (a signed JWT) or the booking reference.
async function findBooking(
  code: string,
  event: { id: string; organiserId: string },
) {
  const reference = code.toUpperCase();
  if (REFERENCE.test(reference)) {
    // A reference isn't signed, but it's random (32^8 codes) and private to
    // the attendee, like the QR code (decision 047)
    const booking = await prisma.booking.findUnique({
      where: { reference },
      include: { event: { select: { organiserId: true } } },
    });
    // Another organiser's booking: the same answer as an unknown reference,
    // so the scanner never confirms it exists (decision 032)
    if (!booking || booking.event.organiserId !== event.organiserId) {
      return INVALID;
    }
    if (booking.eventId !== event.id) return { result: "wrong_event" } as const;
    return booking;
  }

  // The QR code: the signature first, so forged tickets cost no query
  const check = await verifyTicket(code);
  if (!check.ok) return { result: "invalid", reason: check.reason } as const;
  const { ticket } = check;
  // The signed event id is trusted (we signed it): no query needed
  if (ticket.eventId !== event.id) return { result: "wrong_event" } as const;

  const booking = await prisma.booking.findUnique({
    where: { id: ticket.bookingId },
  });
  // The signed claims must still match the booking (defence in depth)
  if (
    !booking ||
    booking.eventId !== ticket.eventId ||
    booking.seats !== ticket.seats
  ) {
    return INVALID;
  }
  return booking;
}

// Checks a scanned code at the door of `event` and, if it's good, checks
// the booking in. Safe when two scanners scan the same ticket at once.
export async function checkIn(
  code: string,
  event: { id: string; organiserId: string },
): Promise<CheckInResult> {
  const found = await findBooking(code, event);
  if ("result" in found) return found;
  const booking = found;

  if (booking.status === "CONFIRMED" && !booking.checkedInAt) {
    // One conditional UPDATE: "set checkedInAt only if it's still empty and
    // the booking is still confirmed". Postgres locks the row while it
    // updates it, and a second UPDATE waiting on that lock re-checks the
    // WHERE after the first commits, so only one scanner can change the row
    // (count 1). A "read, then write" in two steps would let both see an
    // empty checkedInAt and both say "valid" (decision 055).
    const now = new Date();
    const { count } = await prisma.booking.updateMany({
      where: { id: booking.id, status: "CONFIRMED", checkedInAt: null },
      data: { checkedInAt: now },
    });
    if (count === 1) {
      return {
        result: "valid",
        reference: booking.reference,
        seats: booking.seats,
        checkedInAt: now,
      };
    }
  }

  // Lost the race, or it was already used or not confirmed before we
  // looked: read the row again so the answer is current
  const current = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { status: true, checkedInAt: true },
  });
  if (current.status !== "CONFIRMED") {
    return {
      result: "no_longer_valid",
      reference: booking.reference,
      bookingStatus: current.status.toLowerCase() as Lowercase<
        Exclude<BookingStatus, "CONFIRMED">
      >,
    };
  }
  // Still confirmed and the update changed nothing: it was checked in.
  // Not checked in here would mean the WHERE above was wrong: say so loudly
  // (500) rather than invent a time.
  if (!current.checkedInAt) {
    throw new Error(`Check-in of booking ${booking.id} changed no row`);
  }
  return {
    result: "already_used",
    reference: booking.reference,
    seats: booking.seats,
    checkedInAt: current.checkedInAt,
  };
}
