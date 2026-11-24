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
import { reminderTime, sendEventReminderEmail } from "../lib/booking-emails.js";
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
