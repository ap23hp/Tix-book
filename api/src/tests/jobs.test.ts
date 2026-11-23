import { randomUUID } from "node:crypto";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "@jest/globals";
import type { PgBoss } from "pg-boss";
import { prisma } from "../lib/prisma.js";
import { newReference } from "../lib/bookings.js";
import { emailGateway, EmailSendError } from "../lib/email.js";
import { sendBookingConfirmedEmail } from "../lib/booking-emails.js";
import {
  createQueues,
  enqueueBookingConfirmedEmail,
  QUEUES,
  runBookingConfirmedJob,
  startJobs,
  startWorkers,
  stopJobs,
} from "../lib/jobs.js";
import { FakeEmailSender } from "./fake-email-sender.js";
import { deleteEmailJobsFor, emailJobsFor } from "./job-helpers.js";

const runId = Date.now();
const PREFIX = "jobs-test-";
const ATTENDEE_EMAIL = `${PREFIX}attendee-${runId}@example.com`;

let boss: PgBoss;
let eventId = "";
let userId = "";

async function makeBooking(status: "CONFIRMED" | "REFUNDED" = "CONFIRMED") {
  return prisma.booking.create({
    data: {
      eventId,
      userId,
      seats: 2,
      status,
      unitPricePence: 1500,
      reference: newReference(),
      idempotencyKey: randomUUID(),
    },
  });
}

beforeAll(async () => {
  boss = await startJobs();
  const organiser = await prisma.user.create({
    data: {
      name: "Jobs organiser",
      email: `${PREFIX}organiser-${runId}@example.com`,
      role: "ORGANISER",
    },
  });
  const attendee = await prisma.user.create({
    data: { name: "Jobs attendee", email: ATTENDEE_EMAIL, role: "ATTENDEE" },
  });
  userId = attendee.id;
  const event = await prisma.event.create({
    data: {
      title: "Jobs test event",
      description: "For the jobs tests",
      category: "Tech",
      format: "IN_PERSON",
      status: "PUBLISHED",
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60_000 + 2 * 60 * 60_000),
      timezone: "Europe/London",
      venueName: "The Hall",
      venueAddress: "1 High St, London",
      pricePence: 1500,
      seatLimit: 50,
      organiserId: organiser.id,
    },
  });
  eventId = event.id;
});

afterEach(() => {
  emailGateway.sender = undefined;
  delete process.env.EMAIL_SANDBOX_ALLOWLIST;
});

afterAll(async () => {
  await deleteEmailJobsFor({ eventId });
  await stopJobs();
  await prisma.booking.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe("saving a job in the booking's transaction", () => {
  it("a rolled-back transaction leaves no job behind", async () => {
    const booking = await makeBooking();
    await expect(
      prisma.$transaction(async (tx) => {
        await enqueueBookingConfirmedEmail(tx, booking.id);
        throw new Error("something later in the transaction failed");
      }),
    ).rejects.toThrow("something later");
    expect(await emailJobsFor(booking.id)).toHaveLength(0);
  });

  it("a committed transaction leaves exactly one job", async () => {
    const booking = await makeBooking();
    await prisma.$transaction(async (tx) => {
      await enqueueBookingConfirmedEmail(tx, booking.id);
    });
    const jobs = await emailJobsFor(booking.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.data).toEqual({ bookingId: booking.id });
  });
});

describe("the confirmation email", () => {
  it("is sent to the attendee with one idempotency key per booking", async () => {
    const fake = new FakeEmailSender();
    emailGateway.sender = fake;
    process.env.EMAIL_SANDBOX_ALLOWLIST = ATTENDEE_EMAIL;
    const booking = await makeBooking();

    expect(await sendBookingConfirmedEmail(booking.id)).toEqual({
      status: "sent",
      id: "fake-1",
    });
    const [message] = fake.sent;
    expect(message!.to).toBe(ATTENDEE_EMAIL);
    expect(message!.idempotencyKey).toBe(`booking-confirmed/${booking.id}`);
    expect(message!.subject).toBe("Booking confirmed: Jobs test event");
    expect(message!.text).toContain(booking.reference);
  });

  it("is skipped (not failed) outside the sandbox allowlist", async () => {
    const fake = new FakeEmailSender();
    emailGateway.sender = fake;
    process.env.EMAIL_SANDBOX_ALLOWLIST = "someone-else@example.com";
    const booking = await makeBooking();
    expect(await sendBookingConfirmedEmail(booking.id)).toEqual({
      status: "skipped",
      reason: "sandbox",
    });
    expect(fake.sent).toHaveLength(0);
  });

  it("isn't sent for a booking refunded before the job ran, or deleted", async () => {
    const fake = new FakeEmailSender();
    emailGateway.sender = fake;
    process.env.EMAIL_SANDBOX_ALLOWLIST = "*";
    const refunded = await makeBooking("REFUNDED");
    expect(await sendBookingConfirmedEmail(refunded.id)).toEqual({
      status: "skipped",
      reason: "not confirmed",
    });
    expect(await sendBookingConfirmedEmail(randomUUID())).toEqual({
      status: "skipped",
      reason: "booking not found",
    });
    expect(fake.sent).toHaveLength(0);
  });
});

describe("what a job's result means to the queue", () => {
  const job = { id: "job-1", data: { bookingId: "b-1" } };

  it("sent or skipped → completed", async () => {
    const result = await runBookingConfirmedJob(job, async () => ({
      status: "skipped",
      reason: "sandbox",
    }));
    expect(result).toEqual({
      id: "job-1",
      status: "completed",
      output: { status: "skipped", reason: "sandbox" },
    });
  });

  it("an error a retry can fix → failed (pg-boss retries it)", async () => {
    const result = await runBookingConfirmedJob(job, async () => {
      throw new EmailSendError("Resend answered 503 service_unavailable", true);
    });
    expect(result.status).toBe("failed");
  });

  it("an error a retry can't fix → straight to the dead letter queue", async () => {
    const result = await runBookingConfirmedJob(job, async () => {
      throw new EmailSendError("Resend answered 403 validation_error", false);
    });
    expect(result).toEqual({
      id: "job-1",
      status: "deadletter",
      output: { error: "Resend answered 403 validation_error" },
    });
  });

  it("anything else → failed, with no details stored on the job", async () => {
    const result = await runBookingConfirmedJob(job, async () => {
      throw new Error("connection to secret-host.example failed");
    });
    expect(result).toEqual({
      id: "job-1",
      status: "failed",
      output: { error: "unexpected error" },
    });
  });
});

// A real worker on real pg-boss queues (in the test schema), with short
// retry delays and a fake send that fails on purpose.
describe("retries and the dead letter queue (real worker)", () => {
  const queues: { main: string; deadLetter: string }[] = [];

  async function setUp(label: string, send: () => Promise<unknown>) {
    const names = {
      main: `test-${label}-${runId}`,
      deadLetter: `test-${label}-dlq-${runId}`,
    };
    queues.push(names);
    // Backoff on, like production, but starting at 1 s and capped at 2 s,
    // so the test takes seconds, not minutes
    await createQueues(boss, names, {
      retryLimit: 2,
      retryDelay: 1,
      retryBackoff: true,
      retryDelayMax: 2,
    });
    const workerId = await startWorkers(
      boss,
      names.main,
      (job) => runBookingConfirmedJob(job, send),
      0.5,
    );
    return { names, workerId };
  }

  // Polls until check() is true or the time runs out
  async function waitFor(check: () => Promise<boolean>, ms = 20_000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("timed out waiting");
  }

  afterAll(async () => {
    for (const { main, deadLetter } of queues) {
      await boss.offWork(main);
      await boss.deleteQueue(main);
      await boss.deleteQueue(deadLetter);
    }
  });

  it("a job that keeps failing is tried 3 times, then dead-lettered", async () => {
    let tries = 0;
    const { names } = await setUp("retry", async () => {
      tries++;
      throw new EmailSendError("Resend answered 503", true);
    });
    const jobId = await boss.send(names.main, { bookingId: "b-retry" });

    await waitFor(
      async () => (await boss.findJobs(names.deadLetter)).length > 0,
    );
    // 1 try + retryLimit 2
    expect(tries).toBe(3);
    const [failed] = await boss.findJobs(names.main, { id: jobId! });
    expect(failed!.state).toBe("failed");
    expect(failed!.retryCount).toBe(2);
    const [dead] = await boss.findJobs(names.deadLetter);
    expect(dead!.data).toEqual({ bookingId: "b-retry" });
  }, 30_000);

  it("a permanent error skips the retries", async () => {
    let tries = 0;
    const { names } = await setUp("permanent", async () => {
      tries++;
      throw new EmailSendError("Resend answered 401", false);
    });
    await boss.send(names.main, { bookingId: "b-permanent" });

    await waitFor(
      async () => (await boss.findJobs(names.deadLetter)).length > 0,
    );
    expect(tries).toBe(1);
  }, 30_000);

  it("a job that fails once and then works ends up completed", async () => {
    let tries = 0;
    const { names } = await setUp("recover", async () => {
      tries++;
      if (tries === 1) throw new EmailSendError("Resend timed out", true);
      return { status: "sent", id: "fake" };
    });
    const jobId = await boss.send(names.main, { bookingId: "b-recover" });

    await waitFor(async () => {
      const [job] = await boss.findJobs(names.main, { id: jobId! });
      return job?.state === "completed";
    });
    expect(tries).toBe(2);
    expect(await boss.findJobs(names.deadLetter)).toHaveLength(0);
  }, 30_000);
});

it("the real queues exist with retries, backoff and a dead letter queue", async () => {
  const queue = await boss.getQueue(QUEUES.bookingConfirmed);
  expect(queue).toMatchObject({
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    deadLetter: QUEUES.deadLetter,
  });
});
