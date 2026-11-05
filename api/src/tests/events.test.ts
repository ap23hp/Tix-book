import { describe, it, expect, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
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
afterAll(async () => {
  await prisma.$disconnect();
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
  it("returns 400 with field errors for invalid data", async () => {
    const response = await request(app).post("/api/v1/events").send({
      title: "",
      pricePence: -5,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid event data");

    const fields = response.body.details.map((d: { field: string }) => d.field);
    expect(fields).toContain("title");
    expect(fields).toContain("pricePence");
  });
});
