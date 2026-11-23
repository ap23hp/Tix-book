import { sendEmail, type SendOutcome } from "./email.js";
import { bookingConfirmedEmail } from "./email-templates.js";
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
