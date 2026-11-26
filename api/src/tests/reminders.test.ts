import { randomUUID } from "node:crypto";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "@jest/globals";
import { prisma } from "../lib/prisma.js";
import { newReference } from "../lib/bookings.js";
import { emailGateway } from "../lib/email.js";
import {
  formatDelay,
  reminderTime,
  sendEventReminderEmail,
} from "../lib/booking-emails.js";
import {
  enqueueEventReminderEmail,
  QUEUES,
  runReminderJob,
  stopJobs,
} from "../lib/jobs.js";
import { FakeEmailSender } from "./fake-email-sender.js";
import { deleteEmailJobsFor, emailJobsFor } from "./job-helpers.js";

const runId = Date.now();
const PREFIX = "reminders-test-";
const ATTENDEE_EMAIL = `${PREFIX}attendee-${runId}@example.com`;
const HOUR = 60 * 60_000;

let organiserId = "";
let userId = "";
let fake: FakeEmailSender;

// An event starting `hours` from now, and a booking for it
async function bookingForEventIn(
  hours: number,
  {
    eventStatus = "PUBLISHED",
    bookingStatus = "CONFIRMED",
  }: {
    eventStatus?: "PUBLISHED" | "CANCELLED";
    bookingStatus?: "CONFIRMED" | "REFUNDED";
  } = {},
) {
  const startsAt = new Date(Date.now() + hours * HOUR);
  const event = await prisma.event.create({
    data: {
      title: "Reminders test event",
      description: "For the reminder tests",
      category: "Tech",
      format: "IN_PERSON",
      status: eventStatus,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * HOUR),
      timezone: "Europe/London",
      venueName: "The Hall",
      venueAddress: "1 High St, London",
      pricePence: 0,
      seatLimit: 10,
      organiserId,
    },
  });
  const booking = await prisma.booking.create({
    data: {
      eventId: event.id,
      userId,
      seats: 1,
      status: bookingStatus,
      unitPricePence: 0,
      reference: newReference(),
      idempotencyKey: randomUUID(),
    },
  });
  return { event, booking };
}

beforeAll(async () => {
  organiserId = (
    await prisma.user.create({
      data: {
        name: "Reminders organiser",
        email: `${PREFIX}organiser-${runId}@example.com`,
        role: "ORGANISER",
      },
    })
  ).id;
  userId = (
    await prisma.user.create({
      data: {
        name: "Reminders attendee",
        email: ATTENDEE_EMAIL,
        role: "ATTENDEE",
      },
    })
  ).id;
});

afterEach(() => {
  emailGateway.sender = undefined;
  delete process.env.EMAIL_SANDBOX_ALLOWLIST;
});

function useFakeSender() {
  fake = new FakeEmailSender();
  emailGateway.sender = fake;
  process.env.EMAIL_SANDBOX_ALLOWLIST = ATTENDEE_EMAIL;
}

afterAll(async () => {
  const mine = { user: { email: { startsWith: PREFIX } } };
  await deleteEmailJobsFor(mine);
  await stopJobs();
  await prisma.booking.deleteMany({ where: mine });
  await prisma.event.deleteMany({
    where: { organiser: { email: { startsWith: PREFIX } } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe("queueing a reminder", () => {
  it("is due 24 hours before the event", async () => {
    const { event, booking } = await bookingForEventIn(72);
    await prisma.$transaction((tx) =>
      enqueueEventReminderEmail(tx, booking.id, event.startsAt),
    );
    const [job] = await emailJobsFor(booking.id, QUEUES.eventReminder);
    expect(job!.startAfter).toEqual(reminderTime(event.startsAt));
    expect(reminderTime(event.startsAt).getTime()).toBe(
      event.startsAt.getTime() - 24 * HOUR,
    );
  });

  it("isn't queued when the event is less than a day away", async () => {
    const { event, booking } = await bookingForEventIn(10);
    await prisma.$transaction((tx) =>
      enqueueEventReminderEmail(tx, booking.id, event.startsAt),
    );
    expect(await emailJobsFor(booking.id, QUEUES.eventReminder)).toHaveLength(
      0,
    );
  });
});

describe("sending a reminder (checked when the job runs)", () => {
  it("sends it when the event is a day away, with a key per start time", async () => {
    useFakeSender();
    const { event, booking } = await bookingForEventIn(23.9);
    expect(await sendEventReminderEmail(booking.id)).toEqual({
      status: "sent",
      id: "fake-1",
    });
    const [message] = fake.sent;
    expect(message!.to).toBe(ATTENDEE_EMAIL);
    expect(message!.subject).toBe(
      "Reminder: Reminders test event is coming up",
    );
    expect(message!.idempotencyKey).toBe(
      `event-reminder/${booking.id}/${event.startsAt.getTime()}`,
    );
  });

  it("skips a cancelled event, a refunded booking and a started event", async () => {
    useFakeSender();
    const cancelled = await bookingForEventIn(20, { eventStatus: "CANCELLED" });
    const refunded = await bookingForEventIn(20, {
      bookingStatus: "REFUNDED",
    });
    const started = await bookingForEventIn(-1);
    expect(await sendEventReminderEmail(cancelled.booking.id)).toEqual({
      status: "skipped",
      reason: "event not published",
    });
    expect(await sendEventReminderEmail(refunded.booking.id)).toEqual({
      status: "skipped",
      reason: "not confirmed",
    });
    expect(await sendEventReminderEmail(started.booking.id)).toEqual({
      status: "skipped",
      reason: "event started",
    });
    expect(fake.sent).toHaveLength(0);
  });

  it("an event moved later: the job queues a new reminder instead of sending", async () => {
    useFakeSender();
    // Queued for an event 2 days away; the organiser then moved it to 5 days
    const { event, booking } = await bookingForEventIn(48);
    const movedTo = new Date(event.startsAt.getTime() + 3 * 24 * HOUR);
    await prisma.event.update({
      where: { id: event.id },
      data: {
        startsAt: movedTo,
        endsAt: new Date(movedTo.getTime() + 2 * HOUR),
      },
    });

    const result = await runReminderJob({
      id: "job-moved",
      data: { bookingId: booking.id },
    });
    expect(result.status).toBe("completed");
    expect(result.output).toEqual({
      status: "rescheduled",
      remindAt: reminderTime(movedTo),
    });
    expect(fake.sent).toHaveLength(0);
    const [job] = await emailJobsFor(booking.id, QUEUES.eventReminder);
    expect(job!.startAfter).toEqual(reminderTime(movedTo));
  });
});

// Render's free plan sleeps, so a due reminder can wait for the next wake-up
// (decision 069). `now` is passed in (a fake clock), and `log` collects the
// lines instead of printing them.
describe("late and missed reminders are logged", () => {
  const MINUTE = 60_000;

  function collectLog() {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  }

  it("formats a delay as hours and whole minutes", () => {
    expect(formatDelay(2 * HOUR + 5 * MINUTE)).toBe("2h 5m");
    expect(formatDelay(16 * MINUTE + 59_000)).toBe("0h 16m");
    expect(formatDelay(26 * HOUR)).toBe("26h 0m");
  });

  it("logs 'sent late' when sent more than 15 minutes after the reminder time", async () => {
    useFakeSender();
    const { event, booking } = await bookingForEventIn(48);
    const remindAt = reminderTime(event.startsAt).getTime();
    const { lines, log } = collectLog();

    const outcome = await sendEventReminderEmail(
      booking.id,
      new Date(remindAt + 2 * HOUR + 5 * MINUTE),
      log,
    );

    expect(outcome).toEqual({ status: "sent", id: "fake-1" });
    expect(lines).toEqual([
      `[jobs] reminder sent late by 2h 5m (event-reminder/${booking.id}/${event.startsAt.getTime()})`,
    ]);
  });

  it("doesn't log at exactly 15 minutes late, or when on time", async () => {
    useFakeSender();
    const { event, booking } = await bookingForEventIn(48);
    const remindAt = reminderTime(event.startsAt).getTime();
    const { lines, log } = collectLog();

    await sendEventReminderEmail(booking.id, new Date(remindAt), log);
    await sendEventReminderEmail(
      booking.id,
      new Date(remindAt + 15 * MINUTE),
      log,
    );

    expect(fake.sent).toHaveLength(2);
    expect(lines).toEqual([]);
  });

  it("doesn't say 'sent' when the sandbox skipped the email", async () => {
    useFakeSender();
    // Not on the allowlist, so Resend's sandbox rule skips it
    process.env.EMAIL_SANDBOX_ALLOWLIST = "someone-else@example.com";
    const { event, booking } = await bookingForEventIn(48);
    const { lines, log } = collectLog();

    const outcome = await sendEventReminderEmail(
      booking.id,
      new Date(reminderTime(event.startsAt).getTime() + 3 * HOUR),
      log,
    );

    expect(outcome).toEqual({ status: "skipped", reason: "sandbox" });
    expect(lines).toEqual([]);
  });

  it("logs 'missed' when the event has already started, with no email address", async () => {
    useFakeSender();
    const { event, booking } = await bookingForEventIn(48);
    const { lines, log } = collectLog();

    const outcome = await sendEventReminderEmail(
      booking.id,
      new Date(event.startsAt.getTime() + MINUTE),
      log,
    );

    expect(outcome).toEqual({ status: "skipped", reason: "event started" });
    expect(fake.sent).toHaveLength(0);
    expect(lines).toEqual([
      `[jobs] reminder missed: event already started (event-reminder/${booking.id}/${event.startsAt.getTime()})`,
    ]);
    expect(lines.join(" ")).not.toContain("@");
  });
});
