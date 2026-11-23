import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
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

// ---- Paying (phase 5) ----
// Stripe's hosted page can't be driven reliably in a test, so after "Pay"
// lands on checkout.stripe.com, the test plays Stripe's part: it sends the
// local API the same signed webhook Stripe (or `stripe listen`) would send.
// The secret is read from api/.env inside the test process, never printed.
// Without it (no Stripe set up), the payment tests skip.
export function webhookSecret(): string | undefined {
  const file = path.resolve(__dirname, "../../api/.env");
  if (!existsSync(file)) return undefined;
  const value = parseEnv(readFileSync(file, "utf8")).STRIPE_WEBHOOK_SECRET;
  return value || undefined;
}

// Stripe's signature: HMAC-SHA256 of "timestamp.body" with the webhook
// secret, sent as "t=<timestamp>,v1=<hex>" in the Stripe-Signature header
export async function sendPaidWebhook(
  request: APIRequestContext,
  bookingId: string,
  secret: string,
) {
  const payload = JSON.stringify({
    id: `evt_test_e2e_${randomUUID()}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_e2e_${randomUUID()}`,
        object: "checkout.session",
        client_reference_id: bookingId,
        payment_intent: `pi_test_e2e_${randomUUID()}`,
        payment_status: "paid",
      },
    },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const response = await request.post(
    "http://localhost:4000/api/v1/payments/webhook",
    {
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": `t=${timestamp},v1=${signature}`,
      },
      data: payload,
    },
  );
  expect(response.status()).toBe(200);
}
