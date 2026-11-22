import express, { Router } from "express";
import { handleStripeEvent } from "../lib/payments.js";
import { verifyWebhook } from "../lib/stripe.js";

export const paymentsRouter = Router();

// POST /api/v1/payments/webhook ← Stripe calls this, not the browser.
// express.raw keeps the body as the exact bytes Stripe sent (a Buffer),
// which the signature check needs. This router is mounted BEFORE
// express.json() in app.ts, or the JSON parser would read the body first.
paymentsRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.get("stripe-signature");
    if (!signature || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Missing Stripe signature" });
      return;
    }

    let event;
    try {
      event = verifyWebhook(req.body, signature);
    } catch {
      // Wrong signature, wrong secret, or too old (a replayed request).
      // Anyone can POST here, so this check is what makes it safe.
      res.status(400).json({ error: "Invalid Stripe signature" });
      return;
    }

    // Any error from here on is ours: the error handler answers 500, and
    // Stripe retries the event later with exponential backoff.
    const { duplicate } = await handleStripeEvent(event);
    res.status(200).json({ received: true, duplicate });
  },
);
