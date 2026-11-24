import { Router } from "express";
import { z } from "zod";
import { checkIn } from "../lib/check-in.js";
import { parseOrThrow } from "../lib/errors.js";
import { findOwnEvent } from "../lib/own-event.js";
import { getUser, requireAuth, requireRole } from "../middleware/auth.js";

export const ticketsRouter = Router();

const verifySchema = z.object({
  // The event at whose door the organiser is scanning
  eventId: z.string().min(1).max(100),
  // The ticket QR code (a signed JWT) or the booking reference, pasted in
  code: z.string().trim().min(1, "Enter a ticket code").max(2000),
});

// POST /api/v1/tickets/verify { eventId, code } → let this person in?
// For the organiser at the door of their own event. Checks the ticket
// (signature, then the booking in the database: a JWT can't be taken back,
// decision 046) and checks it in, once only (decision 055).
// Every scan outcome is 200 { result, ... }: valid, already_used,
// no_longer_valid, wrong_event, invalid. 4xx means the request itself was
// wrong: 400 no code, 401/403 not an organiser, 404 not your event.
ticketsRouter.post(
  "/verify",
  requireAuth,
  requireRole("ORGANISER"),
  async (req, res) => {
    const { eventId, code } = parseOrThrow(
      verifySchema,
      req.body,
      "Invalid ticket",
    );
    // Only at the door of your own event (404 otherwise, decision 032)
    const event = await findOwnEvent(eventId, getUser(res).id);

    res.status(200).json(await checkIn(code, event));
  },
);
