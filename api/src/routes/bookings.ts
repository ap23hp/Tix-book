import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { getUser, requireAuth } from "../middleware/auth.js";
import { HttpError } from "../lib/errors.js";
import { confirmHold, expireHolds } from "../lib/bookings.js";
import { bookingEventSelect, bookingView } from "../lib/booking-view.js";
import { startCheckout } from "../lib/payments.js";

export const bookingsRouter = Router();

// Every booking route is for the logged-in user's own bookings
bookingsRouter.use(requireAuth);

// The most bookings "My tickets" returns at once (newest first)
const MY_BOOKINGS_LIMIT = 50;

// Load one of MY bookings. Someone else's booking gets the same 404 as an
// unknown id, so the API never confirms it exists (like decision 032).
// `id` is the raw req.params.id (typed loosely after middleware).
async function findOwnBooking(id: unknown, userId: string) {
  if (typeof id !== "string") throw new HttpError(404, "Booking not found");
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { event: { select: bookingEventSelect } },
  });
  if (!booking || booking.userId !== userId) {
    throw new HttpError(404, "Booking not found");
  }
  return booking;
}

// GET /api/v1/bookings/mine → my bookings, newest first.
// Must come before "/:id", or "/:id" would catch it with id = "mine".
bookingsRouter.get("/mine", async (_req, res) => {
  const userId = getUser(res).id;
  const now = new Date();

  // Save the EXPIRED status for my holds that ran out (decision 035)
  await expireHolds(prisma, { userId }, now);

  const bookings = await prisma.booking.findMany({
    where: { userId },
    include: { event: { select: bookingEventSelect } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MY_BOOKINGS_LIMIT,
  });

  res.status(200).json({
    bookings: bookings.map((booking) =>
      bookingView(booking, booking.event, now),
    ),
  });
});

// GET /api/v1/bookings/:id → one of my bookings, with serverTime for the
// countdown. A hold that ran out is saved as EXPIRED on the way.
bookingsRouter.get("/:id", async (req, res) => {
  const booking = await findOwnBooking(req.params.id, getUser(res).id);
  const now = new Date();
  await expireHolds(prisma, { id: booking.id }, now);
  res.status(200).json(bookingView(booking, booking.event, now));
});

// POST /api/v1/bookings/:id/checkout → { url } of a Stripe Checkout page
// for my held seats. The booking is confirmed by the Stripe webhook, never
// by the browser coming back from Stripe (anyone can open the success URL).
bookingsRouter.post("/:id/checkout", async (req, res) => {
  const user = getUser(res);
  const booking = await findOwnBooking(req.params.id, user.id);
  const { url } = await startCheckout(booking, user.email);
  res.status(200).json({ url });
});

// POST /api/v1/bookings/:id/confirm → turn my hold into a confirmed booking.
// Stands in for "payment succeeded" until Stripe in phase 5 (decision 036).
// Removed in phase 5b, when the web app switches to Stripe Checkout.
// 409 if the hold has expired (the seats may already be someone else's).
bookingsRouter.post("/:id/confirm", async (req, res) => {
  const booking = await findOwnBooking(req.params.id, getUser(res).id);
  const { booking: confirmed, now } = await confirmHold(booking);
  res.status(200).json(bookingView(confirmed, booking.event, now));
});
