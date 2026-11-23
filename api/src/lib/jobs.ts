import { fromPrisma, PgBoss, type JobResult } from "pg-boss";
import type { Prisma } from "../generated/prisma/client.js";
import {
  reminderTime,
  sendBookingConfirmedEmail,
  sendEventReminderEmail,
} from "./booking-emails.js";
import { EmailSendError } from "./email.js";

// Background jobs with pg-boss, a queue that lives in our own Postgres
// (decision 050). A job is a row in pg-boss's tables; a worker in this same
// API process picks it up a few seconds later.

export const QUEUES = {
  bookingConfirmed: "email.booking-confirmed",
  eventReminder: "email.event-reminder",
  // Jobs that failed every retry, or failed in a way a retry can't fix.
  // Kept to look at (and redrive), never retried on their own.
  deadLetter: "email.dead-letter",
} as const;

// Retries with exponential backoff: roughly 30 s, 1, 2, 4, 8 minutes, with
// a little randomness (jitter) added by pg-boss so retries from many jobs
// don't all land at the same second. About 15 minutes in all: enough to
// ride out a short Resend outage.
export const EMAIL_QUEUE_OPTIONS = {
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  retryDelayMax: 30 * 60,
  // A send has a 10 s timeout (lib/email.ts). A job still "active" after
  // 2 minutes means the worker died mid-job; pg-boss then retries it.
  expireInSeconds: 120,
  deadLetter: QUEUES.deadLetter,
};

// How often an idle worker asks the database for new jobs. pg-boss's
// default is 2 s. A confirmation email a few seconds late is fine, and
// fewer queries is better on Neon's free plan (decision 050).
const POLLING_INTERVAL_SECONDS = 5;

// Tests use their own schema, so a test job can never be picked up by the
// worker of an API running locally on the same dev database.
function schemaName(): string {
  return process.env.NODE_ENV === "test" ? "pgboss_test" : "pgboss";
}

type StartOptions = { workers: boolean };

let ready: Promise<PgBoss> | undefined;

// Starts pg-boss once (creating or updating its schema the first time),
// and creates the queues. Safe to call many times: later calls get the same
// instance. The API calls it before it starts listening (index.ts); tests
// start it on the first enqueue.
export function startJobs(
  options: StartOptions = { workers: false },
): Promise<PgBoss> {
  ready ??= (async () => {
    // Without it pg fails with "client password must be a string", which
    // doesn't say what's wrong. (dotenv reads .env from the folder the API
    // is started in, so starting it from the repo root loses it.)
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "Background jobs can't start: DATABASE_URL is not set (start the API from the api/ folder)",
      );
    }
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: schemaName(),
      // Small pool: Prisma has its own connections, and Neon's free plan
      // limits how many we can open
      max: 3,
      // No cron jobs yet; maintenance (deleting old jobs) only in the
      // running API, not in tests
      schedule: false,
      supervise: options.workers,
    });
    // pg-boss reports background problems (e.g. a lost connection) as
    // 'error' events. Without a listener Node would crash the process.
    boss.on("error", (err) => console.error("[jobs] pg-boss error:", err));
    await boss.start();
    // Both email queues share one dead letter queue
    await createQueues(boss, {
      main: QUEUES.bookingConfirmed,
      deadLetter: QUEUES.deadLetter,
    });
    await createQueues(boss, {
      main: QUEUES.eventReminder,
      deadLetter: QUEUES.deadLetter,
    });
    if (options.workers) {
      await startWorker(boss, QUEUES.bookingConfirmed, (job) =>
        runEmailJob(job, sendBookingConfirmedEmail),
      );
      await startWorker(boss, QUEUES.eventReminder, runReminderJob);
    }
    return boss;
  })();
  return ready;
}

export async function stopJobs(): Promise<void> {
  if (!ready) return;
  const boss = await ready;
  ready = undefined;
  // graceful: let a job that is being sent finish first (up to 30 s)
  await boss.stop({ graceful: true });
}

// The dead letter queue must exist before a queue can point at it.
// createQueue isn't documented as safe to repeat, so check first.
export async function createQueues(
  boss: PgBoss,
  names: { main: string; deadLetter: string },
  options: Partial<typeof EMAIL_QUEUE_OPTIONS> = {},
): Promise<void> {
  if (!(await boss.getQueue(names.deadLetter))) {
    await boss.createQueue(names.deadLetter);
  }
  if (!(await boss.getQueue(names.main))) {
    await boss.createQueue(names.main, {
      ...EMAIL_QUEUE_OPTIONS,
      ...options,
      deadLetter: names.deadLetter,
    });
  }
}

export type BookingEmailJob = { bookingId: string };

// Called inside the transaction that confirms the booking.
export async function enqueueBookingConfirmedEmail(
  tx: Prisma.TransactionClient,
  bookingId: string,
): Promise<void> {
  const boss = await startJobs();
  const data: BookingEmailJob = { bookingId };
  // `db`: save the job with OUR transaction instead of pg-boss's own
  // connection (decision 050), so it commits with the booking or not at
  // all. fromPrisma is pg-boss's adapter for a Prisma transaction; values
  // are sent as parameters, never pasted into the SQL.
  await boss.send(QUEUES.bookingConfirmed, data, { db: fromPrisma(tx) });
}

// Called inside the same transaction, for the reminder. pg-boss won't hand
// the job to a worker before `startAfter`. Booked less than a day before
// the event: no reminder, the confirmation is enough.
export async function enqueueEventReminderEmail(
  tx: Prisma.TransactionClient,
  bookingId: string,
  startsAt: Date,
  now: Date = new Date(),
): Promise<void> {
  const remindAt = reminderTime(startsAt);
  if (remindAt <= now) return;
  const boss = await startJobs();
  const data: BookingEmailJob = { bookingId };
  await boss.send(QUEUES.eventReminder, data, {
    db: fromPrisma(tx),
    startAfter: remindAt,
  });
}

// The reminder job: send it, unless the event moved later since the job
// was queued; then queue a new one for the new time and finish this one.
export async function runReminderJob(job: {
  id: string;
  data: BookingEmailJob;
}): Promise<JobResult> {
  return runEmailJob(job, async (bookingId) => {
    const outcome = await sendEventReminderEmail(bookingId);
    if (outcome.status !== "too early") return outcome;
    const boss = await startJobs();
    await boss.send(
      QUEUES.eventReminder,
      { bookingId },
      { startAfter: outcome.remindAt },
    );
    return { status: "rescheduled", remindAt: outcome.remindAt };
  });
}

// What one email job turns into:
// - sent, or skipped on purpose (sandbox, no key, booking gone) → completed
// - an error a retry could fix (timeout, 5xx, rate limit, database) → failed,
//   and pg-boss retries it with backoff, then dead-letters it
// - an error a retry can't fix (bad key, refused address) → straight to the
//   dead letter queue, skipping the remaining retries
// The stored output never holds an address, a key or Resend's own message.
export async function runEmailJob(
  job: { id: string; data: BookingEmailJob },
  send: (bookingId: string) => Promise<unknown>,
): Promise<JobResult> {
  try {
    const outcome = await send(job.data.bookingId);
    return { id: job.id, status: "completed", output: outcome };
  } catch (err) {
    if (err instanceof EmailSendError) {
      return {
        id: job.id,
        status: err.retryable ? "failed" : "deadletter",
        output: { error: err.message },
      };
    }
    // Anything else (e.g. the database was unreachable): log it here, keep
    // the stored output generic, and let the retries try again
    console.error(`[jobs] job ${job.id} failed:`, err);
    return {
      id: job.id,
      status: "failed",
      output: { error: "unexpected error" },
    };
  }
}

export async function startWorker(
  boss: PgBoss,
  queue: string,
  run: (job: { id: string; data: BookingEmailJob }) => Promise<JobResult>,
  pollingIntervalSeconds: number = POLLING_INTERVAL_SECONDS,
): Promise<string> {
  // One job at a time is plenty at this size. perJobResults lets the
  // handler say "dead-letter this one now" instead of only throwing.
  return boss.work<BookingEmailJob>(
    queue,
    { batchSize: 1, pollingIntervalSeconds, perJobResults: true },
    (jobs) => Promise.all(jobs.map((job) => run(job))),
  );
}
