import type { Booking, Event } from "../generated/prisma/client.js";

type EventPart = Pick<
  Event,
  | "id"
  | "title"
  | "startsAt"
  | "endsAt"
  | "timezone"
  | "format"
  | "venueName"
  | "venueAddress"
  | "meetingLink"
>;

// The event fields a booking response includes
export const bookingEventSelect = {
  id: true,
  title: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  format: true,
  venueName: true,
  venueAddress: true,
  meetingLink: true,
} as const;

// What the API sends for a booking. Only safe fields: no idempotency key,
// no Stripe id.
// - status: a hold whose time has run out is reported as EXPIRED, even if
//   the stored row hasn't been updated yet
// - serverTime: the countdown uses the server's clock, not the browser's
//   (decision 008), so a wrong clock on the user's computer doesn't matter
// - meetingLink: only once the booking is confirmed
export function bookingView(
  booking: Booking,
  event: EventPart | null,
  now: Date = new Date(),
) {
  const expired =
    booking.status === "HELD" &&
    booking.holdExpiresAt !== null &&
    booking.holdExpiresAt <= now;
  const status = expired ? "EXPIRED" : booking.status;

  return {
    id: booking.id,
    reference: booking.reference,
    status,
    seats: booking.seats,
    unitPricePence: booking.unitPricePence,
    totalPence: booking.unitPricePence * booking.seats,
    holdExpiresAt: booking.holdExpiresAt,
    createdAt: booking.createdAt,
    serverTime: now,
    event: event && {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
      format: event.format,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      meetingLink: status === "CONFIRMED" ? event.meetingLink : null,
    },
  };
}
