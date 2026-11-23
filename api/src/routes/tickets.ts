import { Router } from "express";
import { z } from "zod";
import { HttpError, parseOrThrow } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { verifyTicket } from "../lib/tickets.js";
import { getUser, requireAuth, requireRole } from "../middleware/auth.js";

export const ticketsRouter = Router();

const verifySchema = z.object({ token: z.string().min(1).max(2000) });

// POST /api/v1/tickets/verify { token } → is this ticket good for entry?
// For the organiser at the door, scanning the QR code. Two checks:
// 1. the signature: did WE issue this ticket, unchanged? (no database)
// 2. the database: is the booking still CONFIRMED? A JWT can't be taken
//    back, so without this a refunded ticket would still let someone in
//    (decision 046).
ticketsRouter.post(
  "/verify",
  requireAuth,
  requireRole("ORGANISER"),
  async (req, res) => {
    const { token } = parseOrThrow(verifySchema, req.body, "Invalid ticket");

    const check = await verifyTicket(token);
    if (!check.ok) {
      throw new HttpError(
        422,
        check.reason === "expired"
          ? "This ticket has expired"
          : "This is not a valid Tixbook ticket",
      );
    }
    const { ticket } = check;

    const booking = await prisma.booking.findUnique({
      where: { id: ticket.bookingId },
      include: {
        event: { select: { id: true, title: true, organiserId: true } },
      },
    });
    // Another organiser's event: the same 404 as an unknown booking, so we
    // never confirm it exists (decision 032)
    if (!booking || booking.event.organiserId !== getUser(res).id) {
      throw new HttpError(404, "Ticket not found");
    }
    // The signed claims must still match the booking (defence in depth)
    if (booking.eventId !== ticket.eventId || booking.seats !== ticket.seats) {
      throw new HttpError(422, "This is not a valid Tixbook ticket");
    }
    if (booking.status !== "CONFIRMED") {
      throw new HttpError(
        409,
        `This ticket is no longer valid (booking ${booking.status.toLowerCase()})`,
      );
    }

    res.status(200).json({
      valid: true,
      reference: booking.reference,
      seats: booking.seats,
      event: { id: booking.event.id, title: booking.event.title },
    });
  },
);
