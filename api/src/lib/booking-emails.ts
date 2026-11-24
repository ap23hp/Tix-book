import { sendEmail, type SendOutcome } from "./email.js";
import {
  bookingConfirmedEmail,
  eventReminderEmail,
} from "./email-templates.js";
import { prisma } from "./prisma.js";
import { webUrl } from "./web-url.js";

export type BookingEmailOutcome =
  | SendOutcome
  | { status: "skipped"; reason: "booking not found" | "not confirmed" };

// Builds and sends the "booking confirmed" email for one booking.
// Reads the booking fresh when the job runs, not when it was queued: if it
// was refunded in between, no "confirmed" email goes out.
export async function sendBookingConfirmedEmail(
  bookingId: string,
): Promise<BookingEmailOutcome> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: { select: { name: true, email: true } },
      event: {
        select: {
          title: true,
          startsAt: true,
          timezone: true,
          format: true,
          venueName: true,
          venueAddress: true,
        },
      },
    },
  });
  if (!booking) return { status: "skipped", reason: "booking not found" };
  if (booking.status !== "CONFIRMED") {
    return { status: "skipped", reason: "not confirmed" };
  }

  const content = bookingConfirmedEmail(
    {
      attendeeName: booking.user.name,
      reference: booking.reference,
      seats: booking.seats,
      eventTitle: booking.event.title,
      startsAt: booking.event.startsAt,
      timezone: booking.event.timezone,
      format: booking.event.format,
      venueName: booking.event.venueName,
      venueAddress: booking.event.venueAddress,
    },
    webUrl(),
  );
  return sendEmail({
    to: booking.user.email,
    ...content,
    // One confirmation per booking: a retry after a timeout can't send a
    // second copy (Resend remembers the key for 24 hours)
    idempotencyKey: `booking-confirmed/${booking.id}`,
  });
}

// ---- Reminder before the event ----

// Reminders go out this long before the event starts
export const REMINDER_HOURS_BEFORE = 24;
// A job may run a little early (clock differences); this much early still
// counts as on time instead of rescheduling
const EARLY_TOLERANCE_MS = 10 * 60_000;

export function reminderTime(startsAt: Date): Date {
  return new Date(startsAt.getTime() - REMINDER_HOURS_BEFORE * 60 * 60_000);
}

export type ReminderOutcome =
  | SendOutcome
  | {
      status: "skipped";
      reason:
        | "booking not found"
        | "not confirmed"
        | "event not published"
        | "event started";
    }
  // The event was moved later since the job was queued: send at the new time
  | { status: "too early"; remindAt: Date };

// Everything is checked when the job runs, not when it was queued (days
// earlier): the booking may have been refunded, the event cancelled or moved.
export async function sendEventReminderEmail(
  bookingId: string,
  now: Date = new Date(),
): Promise<ReminderOutcome> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: { select: { name: true, email: true } },
      event: {
        select: {
          title: true,
          status: true,
          startsAt: true,
          timezone: true,
          format: true,
          venueName: true,
          venueAddress: true,
        },
      },
    },
  });
  if (!booking) return { status: "skipped", reason: "booking not found" };
  if (booking.status !== "CONFIRMED") {
    return { status: "skipped", reason: "not confirmed" };
  }
  const { event } = booking;
  if (event.status !== "PUBLISHED") {
    return { status: "skipped", reason: "event not published" };
  }
  if (event.startsAt <= now)
    return { status: "skipped", reason: "event started" };

  const remindAt = reminderTime(event.startsAt);
  if (remindAt.getTime() > now.getTime() + EARLY_TOLERANCE_MS) {
    return { status: "too early", remindAt };
  }

  const content = eventReminderEmail(
    {
      attendeeName: booking.user.name,
      reference: booking.reference,
      seats: booking.seats,
      eventTitle: event.title,
      startsAt: event.startsAt,
      timezone: event.timezone,
      format: event.format,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
    },
    webUrl(),
  );
  return sendEmail({
    to: booking.user.email,
    ...content,
    // One reminder per booking AND start time: a retry can't send twice,
    // but if the event moves, the new date gets its own reminder
    idempotencyKey: `event-reminder/${booking.id}/${event.startsAt.getTime()}`,
  });
}
