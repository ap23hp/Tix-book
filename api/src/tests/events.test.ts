import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";

const runId = Date.now();

// Signs up, logs in, and returns "session=<token>" for the Cookie header.
// A different label gives a different user (e.g. two organisers).
async function logInAs(
  role: "ATTENDEE" | "ORGANISER",
  label: string = role.toLowerCase(),
): Promise<string> {
  const email = `events-test-${label}-${runId}@example.com`;
  const password = "test-password-1";
  await request(app)
    .post("/api/v1/auth/signup")
    .send({ name: `Test ${role}`, email, password, role });
  const response = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password });
  return response.get("Set-Cookie")?.[0]?.split(";")[0] ?? "";
}

afterAll(async () => {
  // Events first: a user can't be deleted while their events point at them
  await prisma.event.deleteMany({
    where: { organiser: { email: { startsWith: "events-test-" } } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: "events-test-" } },
  });
  await prisma.$disconnect();
});

describe("GET /api/v1/events", () => {
  it("returns only published, upcoming events without meeting links", async () => {
    const response = await request(app).get("/api/v1/events");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.events)).toBe(true);
    expect(response.body).toHaveProperty("nextCursor");

    for (const event of response.body.events) {
      expect(event.status).toBe("PUBLISHED");
      expect(new Date(event.startsAt).getTime()).toBeGreaterThan(Date.now());
      expect(event).not.toHaveProperty("meetingLink");
    }
  });
});

describe("GET /api/v1/events — pagination, search and filters", () => {
  // A unique word in every title, so these tests only see their own events
  const tag = `pagetest${runId}`;

  beforeAll(async () => {
    const organiser = await prisma.user.create({
      data: {
        name: "Pagination organiser",
        email: `events-test-pagination-${runId}@example.com`,
        role: "ORGANISER",
      },
    });

    const base = {
      description: "Created by a test",
      timezone: "Europe/London",
      pricePence: 0,
      seatLimit: 10,
      status: "PUBLISHED" as const,
      organiserId: organiser.id,
    };

    await prisma.event.createMany({
      data: [
        {
          ...base,
          title: `${tag} Comedy one`,
          category: "Comedy",
          format: "IN_PERSON",
          venueName: "Hall",
          venueAddress: "1 Street",
          startsAt: new Date("2030-01-01T19:00:00Z"),
          endsAt: new Date("2030-01-01T21:00:00Z"),
        },
        {
          ...base,
          title: `${tag} Comedy two`,
          category: "Comedy",
          format: "ONLINE",
          meetingLink: "https://example.com/meet",
          startsAt: new Date("2030-01-02T19:00:00Z"),
          endsAt: new Date("2030-01-02T21:00:00Z"),
        },
        {
          ...base,
          title: `${tag} Music three`,
          category: "Music",
          format: "IN_PERSON",
          venueName: "Hall",
          venueAddress: "1 Street",
          startsAt: new Date("2030-01-03T19:00:00Z"),
          endsAt: new Date("2030-01-03T21:00:00Z"),
        },
      ],
    });
  });

  it("pages through results with a cursor, with no duplicates", async () => {
    const page1 = await request(app).get(`/api/v1/events?q=${tag}&limit=2`);

    expect(page1.status).toBe(200);
    expect(page1.body.events).toHaveLength(2);
    expect(typeof page1.body.nextCursor).toBe("string");

    const page2 = await request(app).get(
      `/api/v1/events?q=${tag}&limit=2&cursor=${page1.body.nextCursor}`,
    );

    expect(page2.status).toBe(200);
    expect(page2.body.events).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    // All three, soonest first, each exactly once
    const titles = [...page1.body.events, ...page2.body.events].map(
      (event: { title: string }) => event.title,
    );
    expect(titles).toEqual([
      `${tag} Comedy one`,
      `${tag} Comedy two`,
      `${tag} Music three`,
    ]);
  });

  it("searches titles without caring about capitals", async () => {
    const response = await request(app).get(
      `/api/v1/events?q=${encodeURIComponent(`${tag.toUpperCase()} music`)}`,
    );

    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0].title).toBe(`${tag} Music three`);
  });

  it("filters by category and format", async () => {
    const comedy = await request(app).get(
      `/api/v1/events?q=${tag}&category=comedy`,
    );
    expect(comedy.body.events).toHaveLength(2);

    const onlineComedy = await request(app).get(
      `/api/v1/events?q=${tag}&category=Comedy&format=ONLINE`,
    );
    expect(onlineComedy.body.events).toHaveLength(1);
    expect(onlineComedy.body.events[0].title).toBe(`${tag} Comedy two`);
  });

  it("returns 400 for a bad limit, format or cursor", async () => {
    const badLimit = await request(app).get("/api/v1/events?limit=500");
    expect(badLimit.status).toBe(400);
    expect(badLimit.body.details[0].field).toBe("limit");

    const badFormat = await request(app).get("/api/v1/events?format=PARTY");
    expect(badFormat.status).toBe(400);

    const badCursor = await request(app).get("/api/v1/events?cursor=hello");
    expect(badCursor.status).toBe(400);
    expect(badCursor.body).toEqual({ error: "Invalid cursor" });
  });
});
describe("GET /api/v1/events/:id", () => {
  it("returns one event with seatsLeft", async () => {
    const list = await request(app).get("/api/v1/events");
    const firstEvent = list.body.events[0];

    const response = await request(app).get(`/api/v1/events/${firstEvent.id}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(firstEvent.id);
    expect(typeof response.body.seatsLeft).toBe("number");
    expect(response.body.seatsLeft).toBeLessThanOrEqual(
      response.body.seatLimit,
    );
  });

  it("returns 404 for an event that does not exist", async () => {
    const response = await request(app).get("/api/v1/events/not-a-real-id");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Event not found" });
  });
});

describe("GET /api/v1/events/mine and /mine/:id", () => {
  let ownerCookie = "";
  let otherCookie = "";
  let attendeeCookie = "";
  const ids = { future: "", past: "", others: "" };

  // Everything an event needs; each test event changes only what it's about
  const base = {
    description: "Created by a test",
    category: "Music",
    format: "ONLINE" as const,
    meetingLink: "https://example.com/meet",
    timezone: "Europe/London",
    pricePence: 0,
    seatLimit: 10,
  };

  async function myId(cookie: string): Promise<string> {
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    return me.body.id;
  }

  beforeAll(async () => {
    ownerCookie = await logInAs("ORGANISER", "mine-owner");
    otherCookie = await logInAs("ORGANISER", "mine-other");
    attendeeCookie = await logInAs("ATTENDEE", "mine-attendee");
    const ownerId = await myId(ownerCookie);
    const otherId = await myId(otherCookie);

    const future = await prisma.event.create({
      data: {
        ...base,
        title: "My future draft",
        status: "DRAFT",
        startsAt: new Date("2031-05-01T19:00:00Z"),
        endsAt: new Date("2031-05-01T21:00:00Z"),
        organiserId: ownerId,
      },
    });
    const past = await prisma.event.create({
      data: {
        ...base,
        title: "My past event",
        status: "PUBLISHED",
        startsAt: new Date("2020-05-01T19:00:00Z"),
        endsAt: new Date("2020-05-01T21:00:00Z"),
        organiserId: ownerId,
      },
    });
    const others = await prisma.event.create({
      data: {
        ...base,
        title: "Someone else's event",
        status: "PUBLISHED",
        startsAt: new Date("2031-06-01T19:00:00Z"),
        endsAt: new Date("2031-06-01T21:00:00Z"),
        organiserId: otherId,
      },
    });
    ids.future = future.id;
    ids.past = past.id;
    ids.others = others.id;
  });

  it("returns 401 when not logged in", async () => {
    expect((await request(app).get("/api/v1/events/mine")).status).toBe(401);
  });

  it("returns 403 for an attendee", async () => {
    const response = await request(app)
      .get("/api/v1/events/mine")
      .set("Cookie", attendeeCookie);
    expect(response.status).toBe(403);
  });

  it("lists only my events, drafts and past ones too, latest start first", async () => {
    const response = await request(app)
      .get("/api/v1/events/mine")
      .set("Cookie", ownerCookie);

    expect(response.status).toBe(200);
    expect(
      response.body.events.map((event: { id: string }) => event.id),
    ).toEqual([ids.future, ids.past]);
    expect(response.body.nextCursor).toBeNull();
  });

  it("pages through my events with a cursor", async () => {
    const page1 = await request(app)
      .get("/api/v1/events/mine?limit=1")
      .set("Cookie", ownerCookie);
    expect(page1.body.events[0].id).toBe(ids.future);
    expect(typeof page1.body.nextCursor).toBe("string");

    const page2 = await request(app)
      .get(`/api/v1/events/mine?limit=1&cursor=${page1.body.nextCursor}`)
      .set("Cookie", ownerCookie);
    expect(page2.body.events[0].id).toBe(ids.past);
    expect(page2.body.nextCursor).toBeNull();
  });

  it("returns one of my events with its meeting link, even as a draft", async () => {
    const response = await request(app)
      .get(`/api/v1/events/mine/${ids.future}`)
      .set("Cookie", ownerCookie);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("DRAFT");
    expect(response.body.meetingLink).toBe("https://example.com/meet");
  });

  it("answers someone else's event exactly like an unknown id (404)", async () => {
    const others = await request(app)
      .get(`/api/v1/events/mine/${ids.others}`)
      .set("Cookie", ownerCookie);
    const unknown = await request(app)
      .get("/api/v1/events/mine/not-a-real-id")
      .set("Cookie", ownerCookie);

    expect(others.status).toBe(404);
    expect(unknown.status).toBe(404);
    // Same body, so the response can't tell anyone the event exists
    expect(others.body).toEqual(unknown.body);
    expect(others.body).toEqual({ error: "Event not found" });
  });
});

describe("PATCH /api/v1/events/:id", () => {
  let ownerCookie = "";
  let otherCookie = "";
  let attendeeCookie = "";
  let ownerId = "";
  let eventId = "";

  // Runs in order: later tests build on earlier changes
  beforeAll(async () => {
    ownerCookie = await logInAs("ORGANISER", "patch-owner");
    otherCookie = await logInAs("ORGANISER", "patch-other");
    attendeeCookie = await logInAs("ATTENDEE", "patch-attendee");
    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", ownerCookie);
    ownerId = me.body.id;

    const event = await prisma.event.create({
      data: {
        title: "Original title",
        description: "Created by a test",
        category: "Comedy",
        format: "IN_PERSON",
        venueName: "Hall",
        venueAddress: "1 Street",
        status: "DRAFT",
        startsAt: new Date("2031-07-01T19:00:00Z"),
        endsAt: new Date("2031-07-01T21:00:00Z"),
        timezone: "Europe/London",
        pricePence: 1000,
        seatLimit: 50,
        organiserId: ownerId,
      },
    });
    eventId = event.id;
  });

  const patch = (id: string, cookie: string, body: object) =>
    request(app).patch(`/api/v1/events/${id}`).set("Cookie", cookie).send(body);
  const saved = () =>
    prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const fieldsOf = (response: request.Response) =>
    response.body.details.map((d: { field: string }) => d.field);

  it("returns 401 when not logged in", async () => {
    const response = await request(app)
      .patch(`/api/v1/events/${eventId}`)
      .send({ title: "Nope" });
    expect(response.status).toBe(401);
  });

  it("returns 403 for an attendee", async () => {
    expect(
      (await patch(eventId, attendeeCookie, { title: "Nope" })).status,
    ).toBe(403);
  });

  it("returns 404 for an unknown id", async () => {
    const response = await patch("not-a-real-id", ownerCookie, {
      title: "Nope",
    });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Event not found" });
  });

  it("refuses another organiser with the same 404, and changes nothing", async () => {
    const intruder = await patch(eventId, otherCookie, { title: "Hacked" });
    const unknown = await patch("not-a-real-id", otherCookie, {
      title: "Hacked",
    });

    expect(intruder.status).toBe(404);
    expect(intruder.body).toEqual(unknown.body);
    expect((await saved()).title).toBe("Original title");
  });

  it("checks ownership before validation", async () => {
    // Invalid data from another organiser: still 404, never a 400 that
    // would reveal our rules for someone else's event
    const response = await patch(eventId, otherCookie, { pricePence: -5 });
    expect(response.status).toBe(404);
  });

  it("saves only the fields that were sent", async () => {
    const response = await patch(eventId, ownerCookie, {
      title: "New title",
      pricePence: 1500,
    });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe("New title");
    const row = await saved();
    expect(row.title).toBe("New title");
    expect(row.pricePence).toBe(1500);
    expect(row.venueName).toBe("Hall"); // not sent, so unchanged
  });

  it("ignores organiserId in the body", async () => {
    const other = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", otherCookie);
    const response = await patch(eventId, ownerCookie, {
      organiserId: other.body.id,
    });

    expect(response.status).toBe(200);
    expect((await saved()).organiserId).toBe(ownerId);
  });

  it("checks the rules against the saved event (end before saved start)", async () => {
    // Only endsAt is sent; it's before the startsAt already saved
    const response = await patch(eventId, ownerCookie, {
      endsAt: "2031-07-01T18:00:00.000Z",
    });

    expect(response.status).toBe(400);
    expect(fieldsOf(response)).toContain("endsAt");
  });

  it("won't clear the venue of an in-person event", async () => {
    const response = await patch(eventId, ownerCookie, { venueName: null });
    expect(response.status).toBe(400);
    expect(fieldsOf(response)).toContain("venueName");
  });

  it("refuses status CANCELLED", async () => {
    const response = await patch(eventId, ownerCookie, { status: "CANCELLED" });
    expect(response.status).toBe(400);
    expect(fieldsOf(response)).toContain("status");
  });

  it("switches to online and clears the venue with null", async () => {
    const response = await patch(eventId, ownerCookie, {
      format: "ONLINE",
      meetingLink: "https://example.com/meet",
      venueName: null,
      venueAddress: null,
    });

    expect(response.status).toBe(200);
    const row = await saved();
    expect(row.format).toBe("ONLINE");
    expect(row.venueName).toBeNull();
    expect(row.venueAddress).toBeNull();
  });

  // Our defence in depth relies on this Prisma behaviour, so check it on the
  // real database: update() with a non-unique field in `where` that doesn't
  // match throws P2025 and changes nothing.
  it("Prisma: update with a wrong organiserId throws P2025 and changes nothing", async () => {
    await expect(
      prisma.event.update({
        where: { id: eventId, organiserId: "someone-else" },
        data: { title: "Should not save" },
      }),
    ).rejects.toMatchObject({ code: "P2025" });
    expect((await saved()).title).toBe("New title");
  });
});

describe("POST /api/v1/events", () => {
  // A valid draft online event (drafts don't appear in the public list)
  const validEvent = {
    title: "Test event",
    description: "Created by a test",
    category: "Workshops",
    format: "ONLINE",
    startsAt: "2027-06-01T18:00:00.000Z",
    endsAt: "2027-06-01T19:00:00.000Z",
    timezone: "Europe/London",
    pricePence: 0,
    seatLimit: 10,
  };

  let organiserCookie = "";
  let attendeeCookie = "";

  beforeAll(async () => {
    organiserCookie = await logInAs("ORGANISER");
    attendeeCookie = await logInAs("ATTENDEE");
  });

  it("returns 401 when not logged in", async () => {
    const response = await request(app).post("/api/v1/events").send(validEvent);

    expect(response.status).toBe(401);
  });

  it("returns 403 for an attendee", async () => {
    const response = await request(app)
      .post("/api/v1/events")
      .set("Cookie", attendeeCookie)
      .send(validEvent);

    expect(response.status).toBe(403);
  });

  it("returns 400 with field errors for invalid data", async () => {
    const response = await request(app)
      .post("/api/v1/events")
      .set("Cookie", organiserCookie)
      .send({ title: "", pricePence: -5 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid event data");

    const fields = response.body.details.map((d: { field: string }) => d.field);
    expect(fields).toContain("title");
    expect(fields).toContain("pricePence");
  });

  it("returns 400 when fields break the rules between them", async () => {
    const send = (body: object) =>
      request(app)
        .post("/api/v1/events")
        .set("Cookie", organiserCookie)
        .send({ ...validEvent, ...body });
    const fieldsOf = (response: request.Response) =>
      response.body.details.map((d: { field: string }) => d.field);

    // Ends before it starts
    const backwards = await send({ endsAt: "2027-06-01T17:00:00.000Z" });
    expect(backwards.status).toBe(400);
    expect(fieldsOf(backwards)).toContain("endsAt");

    // In person, but no venue
    const noVenue = await send({ format: "IN_PERSON" });
    expect(noVenue.status).toBe(400);
    expect(fieldsOf(noVenue)).toContain("venueName");

    // Published online, but no meeting link
    const noLink = await send({ status: "PUBLISHED" });
    expect(noLink.status).toBe(400);
    expect(fieldsOf(noLink)).toContain("meetingLink");
  });

  it("creates the event for the logged-in organiser, ignoring organiserId in the body", async () => {
    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", organiserCookie);

    const response = await request(app)
      .post("/api/v1/events")
      .set("Cookie", organiserCookie)
      .send({ ...validEvent, organiserId: "someone-elses-id" });

    expect(response.status).toBe(201);
    expect(response.body.organiserId).toBe(me.body.id);
  });
});
