import { Router } from "express";
import { prisma } from "../lib/prisma.js";

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