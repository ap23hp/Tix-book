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
