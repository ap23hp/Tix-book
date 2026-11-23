import app from "./app.js";
import { startJobs, stopJobs } from "./lib/jobs.js";

const PORT = Number(process.env.PORT) || 4000;

// pg-boss starts BEFORE the API takes requests: a booking that is confirmed
// saves its email job in the same transaction, which needs the queue ready.
// If it can't start (e.g. the database is unreachable), the process exits
// and Render keeps the previous deploy running instead of a broken one.
await startJobs({ workers: true });

const server = app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});

// Render sends SIGTERM before stopping the service (deploys, sleep).
// Stop taking requests, let a job that is being sent finish, then exit.
process.on("SIGTERM", () => {
  server.close();
  stopJobs()
    .catch((err) => console.error("[jobs] stop failed:", err))
    .finally(() => process.exit(0));
});
