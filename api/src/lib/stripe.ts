import Stripe from "stripe";

// Created on first use (like google.ts), so the API and the tests still run
// on a machine where the Stripe settings aren't filled in yet.
let stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (stripe) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Payments are not set up: add STRIPE_SECRET_KEY to the environment",
    );
  }
  stripe = new Stripe(key, {
    // Stripe's default is 80 s. Our users wait on this call (they clicked
    // "Pay"), and Vercel/Render give up long before 80 s, so fail sooner.
    timeout: 10_000,
    // Retry network errors twice. The SDK adds an idempotency key to every
    // retried POST, so a retry can't create a second session or refund.
    maxNetworkRetries: 2,
  });
  return stripe;
}

// Checks that a webhook really came from Stripe: the Stripe-Signature header
// is an HMAC of the exact bytes Stripe sent, made with our webhook secret.
// Needs the RAW body (a Buffer): JSON parsed and re-serialised can differ by
// a single space and fail the check. Throws if the signature is wrong.
// Uses Stripe's static helper, so no API key is needed to verify.
export function verifyWebhook(rawBody: Buffer, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "Payments are not set up: add STRIPE_WEBHOOK_SECRET to the environment",
    );
  }
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// Every call that goes over the network to Stripe lives in this object.
// Tests replace these functions, so the test suite never calls Stripe.
export const stripeGateway = {
  createCheckoutSession(params: Stripe.Checkout.SessionCreateParams) {
    return getStripe().checkout.sessions.create(params);
  },

  retrieveCheckoutSession(id: string) {
    return getStripe().checkout.sessions.retrieve(id);
  },

  // Full refund of one payment. The idempotency key is the payment's id, so
  // however many times a webhook is retried, Stripe refunds it only once.
  refundPayment(paymentIntentId: string) {
    return getStripe().refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey: `refund-${paymentIntentId}` },
    );
  },
};
