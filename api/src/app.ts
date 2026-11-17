import express from "express";
import { eventsRouter } from "./routes/events.js";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import type { ErrorRequestHandler } from "express";
import { blockCrossSiteWrites } from "./middleware/csrf.js";
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(blockCrossSiteWrites); // CSRF: refuse writes started by other websites
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1/events", eventsRouter);
app.use("/api/v1/auth", authRouter);

// Unknown routes → 404 JSON (instead of Express's default HTML page)
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Any error thrown in a route ends up here
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);

  if (err.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON in request body" });
    return;
  }

  res.status(500).json({ error: "Something went wrong" });
};

app.use(errorHandler);

export default app;
