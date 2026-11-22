import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";

// Test data for the end-to-end tests, made through the real API.
// Emails start with "events-test-", so the API tests' cleanup deletes these
// users, their events and their bookings.

export async function signUp(
  request: APIRequestContext,
  role: "ATTENDEE" | "ORGANISER",
  name = role === "ORGANISER" ? "E2E Organiser" : "E2E Attendee",
) {
  const email = `events-test-e2e-${role.toLowerCase()}-${randomUUID()}@example.com`;
  const response = await request.post("/api/v1/auth/signup", {
    data: { name, email, password: `pw-${randomUUID()}`, role },
  });
  expect(response.ok()).toBe(true); // the session cookie is now in `request`
}

// A published online event (organiser must be logged in on `request`)
export async function createEvent(
  request: APIRequestContext,
  {
    title,
    seatLimit,
    pricePence,
  }: { title: string; seatLimit: number; pricePence: number },
): Promise<string> {
  const response = await request.post("/api/v1/events", {
    data: {
      title,
      description: "Created by an end-to-end test",
      category: "Music",
      format: "ONLINE",
      meetingLink: "https://example.com/meet",
      status: "PUBLISHED",
      startsAt: "2031-10-01T18:00:00.000Z",
      endsAt: "2031-10-01T20:00:00.000Z",
      timezone: "Europe/London",
      pricePence,
      seatLimit,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).id;
}

// Hold seats straight through the API (as "someone else" would)
export async function holdSeats(
  request: APIRequestContext,
  eventId: string,
  seats: number,
) {
  const response = await request.post(`/api/v1/events/${eventId}/bookings`, {
    data: { seats, idempotencyKey: randomUUID() },
  });
  expect(response.status()).toBe(201);
}
