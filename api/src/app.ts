import express from "express";
import { eventsRouter } from "./routes/events.js";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { bookingsRouter } from "./routes/bookings.js";
import type { ErrorRequestHandler } from "express";
import { blockCrossSiteWrites } from "./middleware/csrf.js";
import { HttpError } from "./lib/errors.js";
import { paymentsRouter } from "./routes/payments.js";
import { ticketsRouter } from "./routes/tickets.js";
import { createProxyLogger } from "./lib/proxy-log.js";
import { NO_STORE, noStoreByDefault } from "./lib/cache-headers.js";
const app = express();

// How many proxies sit in front of the API, so req.ip is the visitor's IP
// (used for rate limiting) and not the proxy's. 0 locally (no proxy).
// On Render it is set by TRUST_PROXY_HOPS; the number has to match the real
// chain (Vercel, then Render's own proxy), see decision 064.
// A missing or non-number value means 0.
app.set(
  "trust proxy",
  Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "", 10) || 0,
);

// To choose that number from evidence, log a few facts about the first
// /api requests after each start (see lib/proxy-log.ts). First middleware,
// so nothing can answer before it.
app.use(
  "/api",
  createProxyLogger({ trustProxy: () => app.get("trust proxy") }),
);

// Nothing from the API is cached unless a route says so (decision 072):
// Vercel's CDN honours our Cache-Control on the rewrite
app.use("/api", noStoreByDefault);

// Stripe webhooks first: they need the raw body for the signature check,
// so they must come before express.json(). They also skip the CSRF check,
// which is for browsers; the Stripe signature protects this route instead.
app.use("/api/v1/payments", paymentsRouter);

app.use(express.json());
app.use(cookieParser());
app.use(blockCrossSiteWrites); // CSRF: refuse writes started by other websites
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1/events", eventsRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/bookings", bookingsRouter);
app.use("/api/v1/tickets", ticketsRouter);

// Unknown routes → 404 JSON (instead of Express's default HTML page)
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Any error thrown in a route ends up here.
// Always replies with the same shape: { error, details? }
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // An error is never cached, even if the route had allowed it
  res.set("Cache-Control", NO_STORE);
  // Errors we threw on purpose (404, 400 with details, ...)
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.message,
      ...(err.details && { details: err.details }),
    });
    return;
  }

  // Body wasn't valid JSON (thrown by express.json())
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON in request body" });
    return;
  }

  // Anything else is a bug: log it, but never send the details to the client
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
};

app.use(errorHandler);

export default app;
