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
import { seatSummaries, withSeatsLeft } from "../lib/seats.js";
import { expireHolds, holdSeats } from "../lib/bookings.js";
import { bookingEventSelect, bookingView } from "../lib/booking-view.js";
import { holdSeatsSchema } from "../schemas/booking.js";
import { findOwnEvent } from "../lib/own-event.js";
import { cachedEvents, invalidateEvents } from "../lib/event-cache.js";
import { limitByIp } from "../lib/rate-limit.js";
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

  const loadPage = async () => {
    // Ask for one extra row: if it comes back, there's another page
    const rows = await prisma.event.findMany({
      where: {
        status: "PUBLISHED",
        startsAt: { gt: new Date() },
        ...(q && { title: { contains: q, mode: "insensitive" } }),
        ...(category && {
          category: { equals: category, mode: "insensitive" },
        }),
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
    return {
      events,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  };

  // Browsing (no search) is cached, without seats left (lib/event-cache.ts).
  // Searches aren't: every typed word is a new key that is rarely asked
  // for again. Category is matched case-insensitively, so it's lowercased
  // in the key to share one entry.
  const page = q
    ? await loadPage()
    : await cachedEvents(
        `list:${JSON.stringify([category?.toLowerCase(), format, limit, cursor])}`,
        loadPage,
      );

  // A cached page may be up to 30 s old: drop any event that has started
  // since (the database query only returns upcoming ones). After the cache's
  // JSON round trip, startsAt is a string; new Date() reads both.
  const now = Date.now();
  const upcoming = page.events.filter(
    (event) => new Date(event.startsAt).getTime() > now,
  );

  res.status(200).json({
    // Seats left always comes fresh from Postgres, never from the cache.
    // Same calculation as GET /:id (lib/seats.ts)
    events: await withSeatsLeft(upcoming),
    nextCursor: page.nextCursor,
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

    // Confirmed / held / left for the whole page in one query (no N+1)
    const summaries = await seatSummaries(events);

    res.status(200).json({
      // Revenue is only on the event's own dashboard, not in the list
      events: events.map((event) => {
        const seats = summaries.get(event.id)!;
        return {
          ...event,
          seatsConfirmed: seats.seatsConfirmed,
          seatsHeld: seats.seatsHeld,
          seatsLeft: seats.seatsLeft,
        };
      }),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    });
  },
);

// The most bookings the dashboard returns at once (newest first)
const EVENT_BOOKINGS_LIMIT = 200;

// GET /api/v1/events/mine/:id/bookings → the dashboard for one of my events:
// { event, summary, bookings, hasMore }. Attendees are shown by name only:
// the organiser doesn't need their email to run the door (decision 048).
eventsRouter.get(
  "/mine/:id/bookings",
  requireAuth,
  requireRole("ORGANISER"),
  async (req, res) => {
    const event = await findOwnEvent(req.params.id, getUser(res).id);
    const now = new Date();

    // Save the EXPIRED status for holds that ran out (decision 035)
    await expireHolds(prisma, { eventId: event.id }, now);

    const [summaries, rows] = await Promise.all([
      seatSummaries([event], { now }),
      prisma.booking.findMany({
        where: { eventId: event.id },
        include: { user: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: EVENT_BOOKINGS_LIMIT + 1,
      }),
    ]);
    const hasMore = rows.length > EVENT_BOOKINGS_LIMIT;

    res.status(200).json({
      event: {
        id: event.id,
        title: event.title,
        status: event.status,
        startsAt: event.startsAt,
        timezone: event.timezone,
        seatLimit: event.seatLimit,
        pricePence: event.pricePence,
      },
      summary: summaries.get(event.id),
      bookings: rows.slice(0, EVENT_BOOKINGS_LIMIT).map((booking) => {
        // bookingView decides the status the same way as everywhere else
        const view = bookingView(booking, null, now);
        return {
          id: view.id,
          reference: view.reference,
          status: view.status,
          seats: view.seats,
          totalPence: view.totalPence,
          createdAt: view.createdAt,
          attendeeName: booking.user.name,
        };
      }),
      hasMore,
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
  const id = req.params.id;
  // The event row may come from the cache; seats left never does
  const event = await cachedEvents(`event:${id}`, () =>
    prisma.event.findFirst({
      where: { id, status: "PUBLISHED" },
      omit: { meetingLink: true },
    }),
  );

  if (!event) throw new HttpError(404, "Event not found");

  // Fresh from Postgres on every request. Same calculation as the list
  // (lib/seats.ts)
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
    // A new published event belongs on the list straight away
    await invalidateEvents();

    res.status(201).json(event);
  },
);

// POST /api/v1/events/:id/bookings → hold seats (paid event, 5 minutes) or
// book them (free event). Any logged-in user can book (decision 037).
// 201 = new booking; 200 = this idempotency key was already used, so this is
// the same booking again; 409 = not enough seats, or the event has started.
eventsRouter.post(
  "/:id/bookings",
  limitByIp("hold"),
  requireAuth,
  async (req, res) => {
    const { seats, idempotencyKey } = parseOrThrow(
      holdSeatsSchema,
      req.body,
      "Invalid booking",
    );
    const eventId = req.params.id;
    if (typeof eventId !== "string")
      throw new HttpError(404, "Event not found");

    const { booking, created } = await holdSeats({
      eventId,
      userId: getUser(res).id,
      seats,
      idempotencyKey,
    });

    const event = await prisma.event.findUnique({
      where: { id: booking.eventId },
      select: bookingEventSelect,
    });
    res.status(created ? 201 : 200).json(bookingView(booking, event));
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
      // After the save, never before: invalidating first would let a request
      // in between cache the old row again (decision 063). Covers every
      // edit: title, time, publish, back to draft...
      await invalidateEvents();
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
