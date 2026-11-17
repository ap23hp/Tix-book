import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createEventSchema } from "../schemas/event.js";
import { getUser, requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, parseOrThrow } from "../lib/errors.js";
export const eventsRouter = Router();

// GET /api/v1/events → published, upcoming events, soonest first
eventsRouter.get("/", async (_req, res) => {
  const events = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      startsAt: { gt: new Date() },
    },
    orderBy: { startsAt: "asc" },
    omit: { meetingLink: true }, // ← new: hide the meeting link
  });

  res.status(200).json(events);
});

// GET /api/v1/events/:id → one published event, with seats left
eventsRouter.get("/:id", async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { id: req.params.id, status: "PUBLISHED" },
    omit: { meetingLink: true },
  });

  if (!event) throw new HttpError(404, "Event not found");

  const taken = await prisma.booking.aggregate({
    where: {
      eventId: event.id,
      status: { in: ["HELD", "CONFIRMED"] },
    },
    _sum: { seats: true },
  });

  const seatsTaken = taken._sum.seats ?? 0;

  res.status(200).json({ ...event, seatsLeft: event.seatLimit - seatsTaken });
});

// POST /api/v1/events → create an event (organisers only)
eventsRouter.post(
  "/",
  requireAuth, // 401 if not logged in
  requireRole("ORGANISER"), // 403 if not an organiser
  async (req, res) => {
    // Invalid body → throws 400 { error, details } (see lib/errors.ts)
    const data = parseOrThrow(
      createEventSchema,
      req.body,
      "Invalid event data",
    );

    // The organiser is whoever is logged in, never a value from the body
    const event = await prisma.event.create({
      data: { ...data, organiserId: getUser(res).id },
    });

    res.status(201).json(event);
  },
);