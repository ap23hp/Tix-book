import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { MemoryStore, type KeyValueStore } from "../lib/kv-store.js";
import { KEY_PREFIX, setStoreForTests } from "../lib/redis.js";

// The event cache (decision 063), with the in-memory store standing in for
// Redis. Event rows are changed straight in Postgres (prisma.event.update)
// to prove a page came from the cache, and through the API to prove the
// API's own writes invalidate it.

const runId = Date.now();
const tag = `cachetest${runId}`;
let memory: MemoryStore;

// "Redis is down": every call fails, like a timeout or an open circuit
const brokenStore: KeyValueStore = {
  get: () => Promise.reject(new Error("redis down")),
  set: () => Promise.reject(new Error("redis down")),
  del: () => Promise.reject(new Error("redis down")),
  incr: () => Promise.reject(new Error("redis down")),
  ttl: () => Promise.reject(new Error("redis down")),
};

let organiserCookie = "";
let organiserId = "";
let attendeeId = "";

async function logInAs(role: "ATTENDEE" | "ORGANISER") {
  const email = `cache-test-${role.toLowerCase()}-${runId}@example.com`;
  const password = "test-password-1";
  await request(app)
    .post("/api/v1/auth/signup")
    .send({ name: `Cache ${role}`, email, password, role });
  const response = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return {
    cookie: response.get("Set-Cookie")?.[0]?.split(";")[0] ?? "",
    id: user.id,
  };
}

function inDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function createEvent(title: string, extra: object = {}) {
  return prisma.event.create({
    data: {
      title: `${tag} ${title}`,
      description: "Created by a cache test",
      category: `Cache${runId}`,
      format: "ONLINE",
      status: "PUBLISHED",
      startsAt: inDays(30),
      endsAt: inDays(30.1),
      timezone: "Europe/London",
      meetingLink: "https://example.com/meet",
      pricePence: 0,
      seatLimit: 10,
      organiserId,
      ...extra,
    },
  });
}

// The list filtered to this file's own category, so other data can't
// get in the way (category lists are cached; searches are not)
function getList() {
  return request(app).get(`/api/v1/events?category=Cache${runId}`);
}

beforeAll(async () => {
  const organiser = await logInAs("ORGANISER");
  organiserCookie = organiser.cookie;
  organiserId = organiser.id;
  attendeeId = (await logInAs("ATTENDEE")).id;
});

beforeEach(() => {
  memory = new MemoryStore();
  setStoreForTests(memory);
});

afterAll(async () => {
  await prisma.booking.deleteMany({
    where: { user: { email: { startsWith: "cache-test-" } } },
  });
  await prisma.event.deleteMany({
    where: { organiser: { email: { startsWith: "cache-test-" } } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: "cache-test-" } },
  });
  await prisma.$disconnect();
});

describe("event page cache", () => {
  it("serves the event row from the cache on the second request", async () => {
    const event = await createEvent("Detail");
    const first = await request(app).get(`/api/v1/events/${event.id}`);
    expect(first.body.title).toBe(`${tag} Detail`);

    // Changed behind the API's back: no invalidation, so the cached copy shows
    await prisma.event.update({
      where: { id: event.id },
      data: { title: `${tag} Changed in the database` },
    });
    const second = await request(app).get(`/api/v1/events/${event.id}`);
    expect(second.status).toBe(200);
    expect(second.body.title).toBe(`${tag} Detail`);
    // Same shape as a fresh answer, and still no meeting link
    expect(second.body).toEqual(first.body);
    expect(second.body).not.toHaveProperty("meetingLink");
  });

  it("never caches seats left: a new booking shows straight away", async () => {
    const event = await createEvent("Seats", { seatLimit: 5 });
    const before = await request(app).get(`/api/v1/events/${event.id}`);
    expect(before.body.seatsLeft).toBe(5);

    // A booking made without telling the cache anything
    await prisma.booking.create({
      data: {
        eventId: event.id,
        userId: attendeeId,
        seats: 2,
        status: "CONFIRMED",
        unitPricePence: 0,
        idempotencyKey: randomUUID(),
        reference: `CT-${runId}`,
      },
    });

    const after = await request(app).get(`/api/v1/events/${event.id}`);
    expect(after.body.seatsLeft).toBe(3);
    const list = await getList();
    const inList = list.body.events.find(
      (e: { id: string }) => e.id === event.id,
    );
    expect(inList.seatsLeft).toBe(3);
  });

  it("shows an edit made through the API at once (invalidation)", async () => {
    const event = await createEvent("Before edit");
    await request(app).get(`/api/v1/events/${event.id}`); // now cached
    await getList(); // the list too

    const patch = await request(app)
      .patch(`/api/v1/events/${event.id}`)
      .set("Cookie", organiserCookie)
      .send({ title: `${tag} After edit` });
    expect(patch.status).toBe(200);

    const page = await request(app).get(`/api/v1/events/${event.id}`);
    expect(page.body.title).toBe(`${tag} After edit`);
    const list = await getList();
    const titles = list.body.events.map((e: { title: string }) => e.title);
    expect(titles).toContain(`${tag} After edit`);
    expect(titles).not.toContain(`${tag} Before edit`);
  });

  it("hides an event moved back to draft at once", async () => {
    const event = await createEvent("Unpublish me");
    expect((await request(app).get(`/api/v1/events/${event.id}`)).status).toBe(
      200,
    );

    await request(app)
      .patch(`/api/v1/events/${event.id}`)
      .set("Cookie", organiserCookie)
      .send({ status: "DRAFT" })
      .expect(200);

    expect((await request(app).get(`/api/v1/events/${event.id}`)).status).toBe(
      404,
    );
  });

  it("doesn't cache 'not found', so publishing a draft shows at once", async () => {
    const draft = await createEvent("Draft", { status: "DRAFT" });
    expect((await request(app).get(`/api/v1/events/${draft.id}`)).status).toBe(
      404,
    );
    // Nothing but the (missing) version was looked up; nothing was saved
    expect(memory.size).toBe(0);

    // Published straight in the database (no invalidation): still found,
    // because the 404 wasn't cached
    await prisma.event.update({
      where: { id: draft.id },
      data: { status: "PUBLISHED" },
    });
    expect((await request(app).get(`/api/v1/events/${draft.id}`)).status).toBe(
      200,
    );
  });
});

describe("event list cache", () => {
  it("puts a newly created event on a cached list at once", async () => {
    await createEvent("Already there");
    await getList(); // cached without the new event

    const created = await request(app)
      .post("/api/v1/events")
      .set("Cookie", organiserCookie)
      .send({
        title: `${tag} Brand new`,
        description: "Created through the API",
        category: `Cache${runId}`,
        format: "ONLINE",
        status: "PUBLISHED",
        startsAt: inDays(31).toISOString(),
        endsAt: inDays(31.1).toISOString(),
        timezone: "Europe/London",
        meetingLink: "https://example.com/meet",
        pricePence: 0,
        seatLimit: 10,
      });
    expect(created.status).toBe(201);

    const list = await getList();
    const titles = list.body.events.map((e: { title: string }) => e.title);
    expect(titles).toContain(`${tag} Brand new`);
  });

  it("drops an event that started after the list was cached", async () => {
    const soon = await createEvent("Starts soon", {
      startsAt: new Date(Date.now() + 1500),
      endsAt: inDays(1),
    });
    const before = await getList();
    expect(before.body.events.map((e: { id: string }) => e.id)).toContain(
      soon.id,
    );

    await new Promise((resolve) => setTimeout(resolve, 1600));
    const after = await getList(); // from the cache, but it has started
    expect(after.body.events.map((e: { id: string }) => e.id)).not.toContain(
      soon.id,
    );
  });

  it("doesn't cache searches", async () => {
    await createEvent("Searchable");
    await request(app).get(`/api/v1/events?q=${tag}`).expect(200);
    expect(memory.size).toBe(0);
  });
});

describe("when Redis is down", () => {
  it("still answers from Postgres, and edits still work", async () => {
    setStoreForTests(brokenStore);
    const event = await createEvent("Redis down");

    const page = await request(app).get(`/api/v1/events/${event.id}`);
    expect(page.status).toBe(200);
    expect(page.body.seatsLeft).toBe(10);
    expect((await getList()).status).toBe(200);

    const patch = await request(app)
      .patch(`/api/v1/events/${event.id}`)
      .set("Cookie", organiserCookie)
      .send({ title: `${tag} Edited while down` });
    expect(patch.status).toBe(200);
    const again = await request(app).get(`/api/v1/events/${event.id}`);
    expect(again.body.title).toBe(`${tag} Edited while down`);
  });
});

describe("booking never reads the cache", () => {
  it("refuses seats the cache says exist but Postgres doesn't", async () => {
    const event = await createEvent("One seat", { seatLimit: 1 });
    const attendee = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: `cache-test-attendee-${runId}@example.com`,
        password: "test-password-1",
      });
    const cookie = attendee.get("Set-Cookie")?.[0]?.split(";")[0] ?? "";

    // Poison the cache: pretend the event has 100 seats
    await request(app).get(`/api/v1/events/${event.id}`);
    const key = `${KEY_PREFIX}events:v0:event:${event.id}`;
    const cached = JSON.parse((await memory.get(key)) ?? "null");
    expect(cached).not.toBeNull();
    await memory.set(
      key,
      JSON.stringify({ ...cached, seatLimit: 100 }),
      30_000,
    );

    const booking = await request(app)
      .post(`/api/v1/events/${event.id}/bookings`)
      .set("Cookie", cookie)
      .send({ seats: 2, idempotencyKey: randomUUID() });
    expect(booking.status).toBe(409);
  });
});
