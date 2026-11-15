import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";

const runId = Date.now();

// Signs up, logs in, and returns "session=<token>" for the Cookie header
async function logInAs(role: "ATTENDEE" | "ORGANISER"): Promise<string> {
  const email = `events-test-${role.toLowerCase()}-${runId}@example.com`;
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
    expect(Array.isArray(response.body)).toBe(true);

    for (const event of response.body) {
      expect(event.status).toBe("PUBLISHED");
      expect(new Date(event.startsAt).getTime()).toBeGreaterThan(Date.now());
      expect(event).not.toHaveProperty("meetingLink");
    }
  });
});

describe("GET /api/v1/events/:id", () => {
  it("returns one event with seatsLeft", async () => {
    const list = await request(app).get("/api/v1/events");
    const firstEvent = list.body[0];

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
