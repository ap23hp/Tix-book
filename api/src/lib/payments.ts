import type Stripe from "stripe";
import type { Booking } from "../generated/prisma/client.js";
import { HttpError } from "./errors.js";
import { lockEvent } from "./bookings.js";
import { prisma } from "./prisma.js";
import { seatsTakenByEvent } from "./seats.js";
import { stripeGateway } from "./stripe.js";
import { webUrl } from "./web-url.js";

// Stripe's shortest allowed Checkout Session life is 30 minutes after it is
// created (by Stripe's clock). One extra minute so a small clock difference
// between Render and Stripe can't push us under the minimum.
const CHECKOUT_MINUTES = 31;

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 10_000 };

type CheckoutBooking = Booking & { event: { title: string } | null };

// POST /bookings/:id/checkout → a Stripe Checkout page for my held seats.
// The hold must still be running: paying for seats that were already
// released would only end in a refund (decision 041).
export async function startCheckout(
  booking: CheckoutBooking,
  email: string,
  now: Date = new Date(),
): Promise<{ url: string }> {
  if (booking.status === "CONFIRMED") {
    throw new HttpError(409, "This booking is already paid");
  }
  const holdRunning =
    booking.status === "HELD" &&
    booking.holdExpiresAt !== null &&
    booking.holdExpiresAt > now;
  if (!holdRunning) {
    throw new HttpError(
      409,
      "Your hold has expired and the seats were released",
    );
  }

  // Pressed "Pay" before (or twice)? Send them back to the same Stripe page,
  // so one booking doesn't collect several open payment pages.
  if (booking.stripeSessionId) {
    const existing = await stripeGateway.retrieveCheckoutSession(
      booking.stripeSessionId,
    );
    if (existing.status === "open" && existing.url)
      return { url: existing.url };
  }

  const returnTo = `${webUrl()}/bookings/${booking.id}`;
  const session = await stripeGateway.createCheckoutSession({
    mode: "payment",
    // Prices come from OUR database (the price saved on the booking,
    // decision 009), never from the browser
    line_items: [
      {
        quantity: booking.seats,
        price_data: {
          currency: "gbp",
          unit_amount: booking.unitPricePence,
          product_data: { name: booking.event?.title ?? "Event ticket" },
        },
      },
    ],
    // How the webhook finds the booking again
    client_reference_id: booking.id,
    metadata: { bookingId: booking.id },
    customer_email: email,
    expires_at: Math.floor(now.getTime() / 1000) + CHECKOUT_MINUTES * 60,
    success_url: `${returnTo}?payment=success`,
    cancel_url: `${returnTo}?payment=cancelled`,
  });
  if (!session.url) throw new Error("Stripe returned a session without a URL");

  await prisma.booking.update({
    where: { id: booking.id },
    data: { stripeSessionId: session.id },
  });
  return { url: session.url };
}

type Outcome = "confirmed" | "refund" | "nothing";

// A paid Checkout Session → confirm the booking, or refund the payment.
// Runs under the same event row lock as booking (decision 034), and reads
// the clock after getting it, so it can't race a new booking for the seats.
//
// - hold still running → CONFIRMED
// - hold ran out, but the seats are still free → CONFIRMED (paid late)
// - seats taken by someone else, or the event was cancelled / has started
//   → REFUNDED, and the money goes back
// - the booking was already paid with a DIFFERENT payment (two Stripe tabs)
//   → refund that second payment, the booking stays as it is
// - this same payment again (a duplicate webhook) → nothing changes
async function fulfilCheckout(session: Stripe.Checkout.Session) {
  const bookingId = session.client_reference_id;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!bookingId || !paymentIntentId) {
    // Not one of our sessions (or a bug): nothing we can match it to
    console.error("Checkout session without booking or payment", session.id);
    return;
  }

  const outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
    const found = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!found) return "refund";

    const event = await lockEvent(tx, found.eventId);
    // Re-read AFTER the lock: another webhook may have changed it meanwhile
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    const now = new Date();

    if (booking.stripePaymentIntentId === paymentIntentId) {
      // Seen this payment before. If we decided to refund it, refund again:
      // the last attempt may have failed, and Stripe's idempotency key makes
      // a second call harmless.
      return booking.status === "REFUNDED" ? "refund" : "nothing";
    }
    if (booking.status !== "HELD" && booking.status !== "EXPIRED") {
      return "refund"; // already paid, cancelled or refunded
    }

    let seatsFree =
      booking.status === "HELD" &&
      booking.holdExpiresAt !== null &&
      booking.holdExpiresAt > now;
    if (!seatsFree && event) {
      // The hold ran out, so its seats aren't counted as taken any more.
      // Are there still enough free for this booking?
      const taken =
        (await seatsTakenByEvent([event.id], { now, db: tx })).get(event.id) ??
        0;
      seatsFree =
        event.status === "PUBLISHED" &&
        event.startsAt > now &&
        event.seatLimit - taken >= booking.seats;
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: seatsFree ? "CONFIRMED" : "REFUNDED",
        stripePaymentIntentId: paymentIntentId,
        stripeSessionId: session.id,
      },
    });
    return seatsFree ? "confirmed" : "refund";
  }, TRANSACTION_OPTIONS);

  // The refund is a network call, so it happens AFTER the transaction:
  // never hold the event lock while waiting for Stripe. If it fails, the
  // error reaches Stripe as a 500, Stripe sends the webhook again, and we
  // end up here again (see "Seen this payment before").
  if (outcome === "refund") {
    await stripeGateway.refundPayment(paymentIntentId);
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "P2002"
  );
}

// Handles one verified webhook event. Stripe can send the same event more
// than once, and in any order (decision 042), so:
// 1. an event id we've finished before is skipped straight away
// 2. every change is conditional on the booking's current state, so two
//    copies arriving at the same moment still change it once
// 3. the id is recorded only after the work succeeded; if anything throws,
//    Stripe retries and we try again
export async function handleStripeEvent(event: Stripe.Event) {
  const seen = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (seen) return { duplicate: true };

  switch (event.type) {
    case "checkout.session.completed":
      // "unpaid" = a slow payment method (e.g. bank debit) still processing;
      // async_payment_succeeded follows when the money arrives
      if (event.data.object.payment_status !== "unpaid") {
        await fulfilCheckout(event.data.object);
      }
      break;
    case "checkout.session.async_payment_succeeded":
      await fulfilCheckout(event.data.object);
      break;
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      // Nothing to undo: no money arrived, and the hold simply runs out
      // (decision 035). The user can book again.
      break;
    default:
      // An event type we didn't ask for: acknowledge it so Stripe stops
      break;
  }

  try {
    await prisma.stripeEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch (err) {
    // A copy of this event finished at the same moment: that's fine
    if (!isUniqueConstraintError(err)) throw err;
  }
  return { duplicate: false };
}
