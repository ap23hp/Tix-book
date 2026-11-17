import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createEventSchema, listEventsQuerySchema } from "../schemas/event.js";
import { getUser, requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, parseOrThrow } from "../lib/errors.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
export const eventsRouter = Router();

// GET /api/v1/events → published, upcoming events, soonest first.
// Cursor pagination: returns { events, nextCursor }.
// To get the next page, send ?cursor=<nextCursor>. nextCursor is null on the last page.
eventsRouter.get("/", async (req, res) => {
  const { q, category, format, limit, cursor } = parseOrThrow(
    listEventsQuerySchema,
    req.query,
    "Invalid query",
  );

  // "After the last event you saw": a later start time, or the same
  // start time with a bigger id (keyset pagination)
  const after = cursor ? decodeCursor(cursor) : null;
  if (cursor && !after) throw new HttpError(400, "Invalid cursor");

  // Ask for one extra row: if it comes back, there's another page
  const rows = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      startsAt: { gt: new Date() },
      ...(q && { title: { contains: q, mode: "insensitive" } }),
      ...(category && { category: { equals: category, mode: "insensitive" } }),
      ...(format && { format }),
      ...(after && {
        OR: [
          { startsAt: { gt: after.startsAt } },
          { startsAt: after.startsAt, id: { gt: after.id } },
        ],
      }),
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    omit: { meetingLink: true }, // the link is only for people who booked
  });

  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const last = events.at(-1);

  res.status(200).json({
    events,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  });
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