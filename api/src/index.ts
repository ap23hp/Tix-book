import express from "express";
import { eventsRouter } from "./routes/events.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1/events", eventsRouter);

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});