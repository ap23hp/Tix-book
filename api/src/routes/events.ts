import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createEventSchema } from "../schemas/event.js";
import { getUser, requireAuth, requireRole } from "../middleware/auth.js";
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

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

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

// POST /api/v1/events → create an event
// POST /api/v1/events → create an event (organisers only)
eventsRouter.post(
  "/",
  requireAuth, // 401 if not logged in
  requireRole("ORGANISER"), // 403 if not an organiser
  async (req, res) => {
    const result = createEventSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: "Invalid event data",
        details: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    // The organiser is whoever is logged in, never a value from the body
    const event = await prisma.event.create({
      data: { ...result.data, organiserId: getUser(res).id },
    });

    res.status(201).json(event);
  },
);
