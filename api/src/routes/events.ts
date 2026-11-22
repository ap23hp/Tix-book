import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  createEventSchema,
  eventRulesSchema,
  listEventsQuerySchema,
  myEventsQuerySchema,
  updateEventSchema,
} from "../schemas/event.js";
import { getUser, requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, parseOrThrow } from "../lib/errors.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { withSeatsLeft } from "../lib/seats.js";
export const eventsRouter = Router();

// The ownership check (IDOR protection), used by every "my event" route.
// The id comes from the URL, so anyone can send any id: load the event and
// compare its owner with the logged-in user. An unknown id and someone
// else's event get the same 404, so the API never confirms that another
// organiser's event exists (decision 032).
//
// `id` is the raw req.params.id. After middleware, Express only types it as
// string | string[] | undefined, so check it here once for every route.
async function findOwnEvent(id: unknown, organiserId: string) {
  if (typeof id !== "string") throw new HttpError(404, "Event not found");

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event || event.organiserId !== organiserId) {
    throw new HttpError(404, "Event not found");
  }
  return event;
}

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
    // Same seats-left calculation as GET /:id (lib/seats.ts)
    events: await withSeatsLeft(events),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  });
});

// These "/mine" routes must come BEFORE "/:id". Express tries routes in order,
// so "/:id" would otherwise catch GET /mine with id = "mine".

// GET /api/v1/events/mine → the logged-in organiser's own events, every
// status (drafts too) and past ones too, latest start first.
// Same { events, nextCursor } shape and cursor as the public list.
eventsRouter.get(
  "/mine",
  requireAuth, // 401 if not logged in
  requireRole("ORGANISER"), // 403 if not an organiser
  async (req, res) => {
    const { limit, cursor } = parseOrThrow(
      myEventsQuerySchema,
      req.query,
      "Invalid query",
    );

    const after = cursor ? decodeCursor(cursor) : null;
    if (cursor && !after) throw new HttpError(400, "Invalid cursor");

    // Newest first, so "after the last one you saw" means an EARLIER start
    // time, or the same start time with a smaller id
    const rows = await prisma.event.findMany({
      where: {
        organiserId: getUser(res).id,
        ...(after && {
          OR: [
            { startsAt: { lt: after.startsAt } },
            { startsAt: after.startsAt, id: { lt: after.id } },
          ],
        }),
      },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;
    const last = events.at(-1);

    res.status(200).json({
      events,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    });
  },
);

// GET /api/v1/events/mine/:id → one of my events, any status, with the
// meeting link (it's mine). Fills the edit form.
eventsRouter.get(
  "/mine/:id",
  requireAuth,
  requireRole("ORGANISER"),
  async (req, res) => {
    const event = await findOwnEvent(req.params.id, getUser(res).id);
    res.status(200).json(event);
  },
);

// GET /api/v1/events/:id → one published event, with seats left
eventsRouter.get("/:id", async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { id: req.params.id, status: "PUBLISHED" },
    omit: { meetingLink: true },
  });

  if (!event) throw new HttpError(404, "Event not found");

  // Same seats-left calculation as the list (lib/seats.ts)
  const [withSeats] = await withSeatsLeft([event]);
  res.status(200).json(withSeats);
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

// PATCH /api/v1/events/:id → edit one of my events (send only what changed)
// Order: who are you (401) → organiser? (403) → your event? (404) → valid? (400)
// Ownership is checked before validation, so another organiser can't learn
// anything about the event, or our rules, from the answer.
eventsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("ORGANISER"),
  async (req, res) => {
    const organiserId = getUser(res).id;
    const event = await findOwnEvent(req.params.id, organiserId);

    // Unknown fields (organiserId, id…) are dropped by Zod, so an event
    // can't be moved to another organiser
    const changes = parseOrThrow(
      updateEventSchema,
      req.body,
      "Invalid event data",
    );

    // Rules between fields are checked on the result: saved event + changes
    parseOrThrow(
      eventRulesSchema,
      { ...event, ...changes },
      "Invalid event data",
    );

    try {
      const updated = await prisma.event.update({
        // organiserId here too (defence in depth): even if the check above
        // had a bug, this can only ever update my own row
        where: { id: event.id, organiserId },
        data: changes,
      });
      res.status(200).json(updated);
    } catch (err) {
      // P2025 = no row matched (e.g. deleted a moment ago)
      if (isRecordNotFoundError(err)) {
        throw new HttpError(404, "Event not found");
      }
      throw err;
    }
  },
);

function isRecordNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "P2025"
  );
}
