import { randomUUID } from "node:crypto";
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "@jest/globals";
import request from "supertest";
import Stripe from "stripe";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createSession, SESSION_COOKIE } from "../lib/session.js";
import { newReference } from "../lib/bookings.js";
import { stripeGateway } from "../lib/stripe.js";
import { QUEUES, stopJobs } from "../lib/jobs.js";
import { deleteEmailJobsFor, emailJobsFor } from "./job-helpers.js";

const runId = Date.now();
const PREFIX = "payments-test-";
const WEBHOOK_SECRET = "whsec_test_only_not_a_real_secret";

// ---- Fake Stripe: record calls instead of going over the network ----
const original = { ...stripeGateway };
let created: Stripe.Checkout.SessionCreateParams[] = [];
let refunds: string[] = [];
let failNextRefund = false;
let openSessions = new Map<string, string>(); // session id → url

beforeEach(() => {
  created = [];
  refunds = [];
  failNextRefund = false;
  openSessions = new Map();
  stripeGateway.createCheckoutSession = async (params) => {
    created.push(params);
    const id = `cs_test_${randomUUID()}`;
    const url = `https://checkout.stripe.test/${id}`;
    openSessions.set(id, url);
    return { id, url } as Stripe.Response<Stripe.Checkout.Session>;
  };
  stripeGateway.retrieveCheckoutSession = async (id) => {
    const url = openSessions.get(id);
    return {
      id,
      url: url ?? null,
      status: url ? "open" : "expired",
    } as Stripe.Response<Stripe.Checkout.Session>;
  };
  stripeGateway.refundPayment = async (paymentIntentId) => {
    if (failNextRefund) {
      failNextRefund = false;
      throw new Error("Stripe timed out");
    }
    refunds.push(paymentIntentId);
    return { id: `re_${paymentIntentId}` } as Stripe.Response<Stripe.Refund>;
  };
});

// ---- Test data ----
async function makeUser(label: string, role: "ATTENDEE" | "ORGANISER") {
  const user = await prisma.user.create({
    data: {
      name: `Payments ${label}`,
      email: `${PREFIX}${label}-${runId}@example.com`,
      role,
    },
  });
  const { token } = await createSession(user.id);
  return { id: user.id, cookie: `${SESSION_COOKIE}=${token}` };
}

let organiserId = "";
let attendee = { id: "", cookie: "" };
let other = { id: "", cookie: "" };

function makeEvent(seatLimit = 10) {
  return prisma.event.create({
    data: {
      title: "Payments test event",
      description: "Created by a test",
      category: "Music",
      format: "ONLINE",
      meetingLink: "https://example.com/meet",
      status: "PUBLISHED",
      startsAt: new Date("2031-11-01T19:00:00Z"),
      endsAt: new Date("2031-11-01T21:00:00Z"),
      timezone: "Europe/London",
      pricePence: 1500,
      seatLimit,
      organiserId,
    },
  });
}

// A booking in any state. holdMinutes < 0 → a hold that has already run out.
function makeBooking(
  eventId: string,
  userId: string,
  { seats = 2, status = "HELD" as "HELD" | "CONFIRMED", holdMinutes = 5 } = {},
) {
  return prisma.booking.create({
    data: {
      eventId,
      userId,
      seats,
      status,
      unitPricePence: 1500,
      holdExpiresAt: new Date(Date.now() + holdMinutes * 60_000),
      reference: newReference(),
      idempotencyKey: randomUUID(),
    },
  });
}

// ---- Webhooks, signed like Stripe signs them ----
function checkoutEvent(
  bookingId: string,
  {
    type = "checkout.session.completed",
    paymentIntent = `pi_test_${randomUUID()}`,
    paymentStatus = "paid",
    eventId = `evt_test_${randomUUID()}`,
  } = {},
) {
  return {
    id: eventId,
    object: "event",
    type,
    data: {
      object: {
        id: `cs_test_${randomUUID()}`,
        object: "checkout.session",
        client_reference_id: bookingId,
        payment_intent: paymentIntent,
        payment_status: paymentStatus,
      },
    },
  };
}

function sendWebhook(event: object, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return request(app)
    .post("/api/v1/payments/webhook")
    .set("Content-Type", "application/json")
    .set("Stripe-Signature", header)
    .send(payload);
}

const status = async (id: string) =>
  (await prisma.booking.findUniqueOrThrow({ where: { id } })).status;

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  organiserId = (await makeUser("organiser", "ORGANISER")).id;
  attendee = await makeUser("attendee", "ATTENDEE");
  other = await makeUser("other", "ATTENDEE");
});

afterAll(async () => {
  // Email jobs first: they point at the bookings by id
  await deleteEmailJobsFor({
    event: { organiser: { email: { startsWith: PREFIX } } },
  });
  await stopJobs();
  Object.assign(stripeGateway, original);
  await prisma.stripeEvent.deleteMany({
    where: { id: { startsWith: "evt_test_" } },
  });
  await prisma.booking.deleteMany({
    where: { event: { organiser: { email: { startsWith: PREFIX } } } },
  });
  await prisma.event.deleteMany({
    where: { organiser: { email: { startsWith: PREFIX } } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe("POST /api/v1/bookings/:id/checkout", () => {
  it("returns 401 when not logged in", async () => {
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id);
    const response = await request(app).post(
      `/api/v1/bookings/${booking.id}/checkout`,
    );
    expect(response.status).toBe(401);
  });

  it("returns 404 for someone else's booking", async () => {
    const event = await makeEvent();
    const booking = await makeBooking(event.id, other.id);
    const response = await request(app)
      .post(`/api/v1/bookings/${booking.id}/checkout`)
      .set("Cookie", attendee.cookie);
    expect(response.status).toBe(404);
    expect(created).toHaveLength(0);
  });

  it("returns 409 when the hold has run out", async () => {
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id, {
      holdMinutes: -1,
    });
    const response = await request(app)
      .post(`/api/v1/bookings/${booking.id}/checkout`)
      .set("Cookie", attendee.cookie);
    expect(response.status).toBe(409);
    expect(created).toHaveLength(0);
  });

  it("returns 409 for a booking that is already paid", async () => {
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id, {
      status: "CONFIRMED",
    });
    const response = await request(app)
      .post(`/api/v1/bookings/${booking.id}/checkout`)
      .set("Cookie", attendee.cookie);
    expect(response.status).toBe(409);
  });

  it("creates a session priced from the database, and reuses it", async () => {
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id, { seats: 3 });

    const first = await request(app)
      .post(`/api/v1/bookings/${booking.id}/checkout`)
      .set("Cookie", attendee.cookie);
    expect(first.status).toBe(200);
    expect(first.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);

    expect(created).toHaveLength(1);
    const params = created[0]!;
    expect(params.client_reference_id).toBe(booking.id);
    expect(params.line_items?.[0]?.quantity).toBe(3);
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(1500);
    expect(params.line_items?.[0]?.price_data?.currency).toBe("gbp");
    // At least Stripe's 30-minute minimum
    const minutes = (params.expires_at! * 1000 - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(30);
    expect(params.success_url).toContain(`/bookings/${booking.id}`);

    // Pressing "Pay" again: same Stripe page, no second session
    const second = await request(app)
      .post(`/api/v1/bookings/${booking.id}/checkout`)
      .set("Cookie", attendee.cookie);
    expect(second.body.url).toBe(first.body.url);
    expect(created).toHaveLength(1);
  });
});

describe("POST /api/v1/payments/webhook", () => {
  it("refuses a request without a signature", async () => {
    const response = await request(app)
      .post("/api/v1/payments/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(checkoutEvent("anything")));
    expect(response.status).toBe(400);
  });

  it("refuses a request signed with the wrong secret, and changes nothing", async () => {
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id);
    const response = await sendWebhook(
      checkoutEvent(booking.id),
      "whsec_attacker",
    );
    expect(response.status).toBe(400);
    expect(await status(booking.id)).toBe("HELD");
  });

  it("confirms a booking whose hold is still running", async () => {
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id);
    const webhook = checkoutEvent(booking.id, {
      paymentIntent: "pi_test_ok" + runId,
    });

    const response = await sendWebhook(webhook);
    expect(response.status).toBe(200);

    const saved = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(saved.status).toBe("CONFIRMED");
    expect(saved.stripePaymentIntentId).toBe("pi_test_ok" + runId);
    expect(refunds).toHaveLength(0);
    // Its confirmation email is queued, in the same transaction
    expect(await emailJobsFor(booking.id)).toHaveLength(1);
    // ...and its reminder, for 24 hours before the event
    const reminders = await emailJobsFor(booking.id, QUEUES.eventReminder);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.startAfter).toEqual(
      new Date(event.startsAt.getTime() - 24 * 60 * 60_000),
    );
  });

  it("does nothing twice when the same event arrives again", async () => {
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id);
    const webhook = checkoutEvent(booking.id);

    await sendWebhook(webhook);
    const again = await sendWebhook(webhook);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(await status(booking.id)).toBe("CONFIRMED");
    expect(refunds).toHaveLength(0);
    expect(await emailJobsFor(booking.id)).toHaveLength(1);
  });

  it("handles two copies arriving at the same moment once", async () => {
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id);
    const webhook = checkoutEvent(booking.id);

    const responses = await Promise.all([
      sendWebhook(webhook),
      sendWebhook(webhook),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await status(booking.id)).toBe("CONFIRMED");
    expect(refunds).toHaveLength(0);
    // Two copies at once still queue ONE email: only the copy that
    // confirmed the booking (under the lock) saved a job
    expect(await emailJobsFor(booking.id)).toHaveLength(1);
  });

  it("treats a new event about the same payment as already done", async () => {
    // Stripe can send different events (different ids) about one payment,
    // e.g. completed and async_payment_succeeded
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id);
    const paymentIntent = `pi_test_${randomUUID()}`;
    await sendWebhook(checkoutEvent(booking.id, { paymentIntent }));
    await sendWebhook(
      checkoutEvent(booking.id, {
        paymentIntent,
        type: "checkout.session.async_payment_succeeded",
      }),
    );
    expect(await status(booking.id)).toBe("CONFIRMED");
    expect(refunds).toHaveLength(0);
    expect(await emailJobsFor(booking.id)).toHaveLength(1);
  });

  it("confirms a late payment when the seats are still free", async () => {
    const event = await makeEvent(10);
    const booking = await makeBooking(event.id, attendee.id, {
      holdMinutes: -1,
    });
    await sendWebhook(checkoutEvent(booking.id));
    expect(await status(booking.id)).toBe("CONFIRMED");
    expect(refunds).toHaveLength(0);
  });

  it("refunds a late payment, once, when someone else got the seats", async () => {
    const event = await makeEvent(2);
    const late = await makeBooking(event.id, attendee.id, {
      seats: 2,
      holdMinutes: -1,
    });
    // After the hold ran out, someone else booked both seats
    await makeBooking(event.id, other.id, { seats: 2, status: "CONFIRMED" });

    const paymentIntent = `pi_test_${randomUUID()}`;
    const webhook = checkoutEvent(late.id, { paymentIntent });
    await sendWebhook(webhook);
    await sendWebhook(webhook); // Stripe sends it again

    expect(await status(late.id)).toBe("REFUNDED");
    expect(refunds).toEqual([paymentIntent]);
    // Refunded, not confirmed: no "confirmed" email, no reminder
    expect(await emailJobsFor(late.id)).toHaveLength(0);
    expect(await emailJobsFor(late.id, QUEUES.eventReminder)).toHaveLength(0);
  });

  it("retries a refund that failed, when Stripe sends the event again", async () => {
    const event = await makeEvent(1);
    const late = await makeBooking(event.id, attendee.id, {
      seats: 1,
      holdMinutes: -1,
    });
    await makeBooking(event.id, other.id, { seats: 1, status: "CONFIRMED" });

    const paymentIntent = `pi_test_${randomUUID()}`;
    const webhook = checkoutEvent(late.id, { paymentIntent });
    failNextRefund = true;
    const first = await sendWebhook(webhook);
    // Our error → 500 → Stripe will retry, and the event isn't marked done
    expect(first.status).toBe(500);
    expect(refunds).toHaveLength(0);

    const retry = await sendWebhook(webhook);
    expect(retry.status).toBe(200);
    expect(refunds).toEqual([paymentIntent]);
    expect(await status(late.id)).toBe("REFUNDED");
  });

  it("refunds a second payment for a booking that is already paid", async () => {
    // Two Stripe tabs, both paid: keep the first, refund the second
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id);
    const firstPayment = `pi_test_${randomUUID()}`;
    const secondPayment = `pi_test_${randomUUID()}`;
    await sendWebhook(
      checkoutEvent(booking.id, { paymentIntent: firstPayment }),
    );
    await sendWebhook(
      checkoutEvent(booking.id, { paymentIntent: secondPayment }),
    );

    const saved = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(saved.status).toBe("CONFIRMED");
    expect(saved.stripePaymentIntentId).toBe(firstPayment);
    expect(refunds).toEqual([secondPayment]);
  });

  it("waits for a slow payment method before confirming", async () => {
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id);
    const paymentIntent = `pi_test_${randomUUID()}`;

    await sendWebhook(
      checkoutEvent(booking.id, { paymentIntent, paymentStatus: "unpaid" }),
    );
    expect(await status(booking.id)).toBe("HELD");

    await sendWebhook(
      checkoutEvent(booking.id, {
        paymentIntent,
        type: "checkout.session.async_payment_succeeded",
      }),
    );
    expect(await status(booking.id)).toBe("CONFIRMED");
  });

  it("changes nothing when a payment fails or the session expires", async () => {
    const event = await makeEvent();
    const booking = await makeBooking(event.id, attendee.id);
    for (const type of [
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ]) {
      const response = await sendWebhook(checkoutEvent(booking.id, { type }));
      expect(response.status).toBe(200);
    }
    expect(await status(booking.id)).toBe("HELD");
    expect(refunds).toHaveLength(0);
  });
});
