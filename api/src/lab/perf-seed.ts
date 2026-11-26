// LAB SCRIPT (phase 7b): fills the DEV database with enough rows that query
// plans mean something. With a few dozen rows Postgres reads the whole table
// whatever indexes exist, because that's cheapest; EXPLAIN ANALYZE only shows
// the difference an index makes on a table of real size.
//
// Run (from api/):  npm run lab:seed           adds the data
//                   npm run lab:seed -- --clean deletes it again
//
// Dev only (dev-only.ts). It never deletes anything it didn't create: every
// user it makes has an email starting with PREFIX, and every event and
// booking belongs to one of those users.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { faker } from "@faker-js/faker";
import { assertDevDatabase } from "./dev-only.js";

assertDevDatabase();
// Imported after the check, so nothing connects before it has passed
const { prisma } = await import("../lib/prisma.js");

const PREFIX = "perf-seed-";
const ORGANISERS = 50;
const ATTENDEES = 2_000;
const EVENTS = 20_000;
const BOOKINGS = 100_000;
const BATCH = 5_000;
const DAY = 24 * 60 * 60_000;

const mine = { email: { startsWith: PREFIX } };

async function clean() {
  const bookings = await prisma.booking.deleteMany({
    where: { OR: [{ user: mine }, { event: { organiser: mine } }] },
  });
  const events = await prisma.event.deleteMany({ where: { organiser: mine } });
  const users = await prisma.user.deleteMany({ where: mine });
  console.log(
    `Deleted ${bookings.count} bookings, ${events.count} events, ${users.count} users`,
  );
}

async function inBatches<T>(rows: T[], save: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) {
    await save(rows.slice(i, i + BATCH));
  }
}

async function seed() {
  if (await prisma.user.count({ where: mine })) {
    throw new Error("Seed data is already there: run with --clean first.");
  }
  // The same data on every run, so before/after numbers compare like for like
  faker.seed(42);
  const now = Date.now();

  const users = [
    ...Array.from({ length: ORGANISERS }, (_, i) => ({
      id: randomUUID(),
      name: faker.person.fullName(),
      email: `${PREFIX}organiser-${i}@example.com`,
      role: "ORGANISER" as const,
    })),
    ...Array.from({ length: ATTENDEES }, (_, i) => ({
      id: randomUUID(),
      name: faker.person.fullName(),
      email: `${PREFIX}attendee-${i}@example.com`,
      role: "ATTENDEE" as const,
    })),
  ];
  const organisers = users.slice(0, ORGANISERS);
  const attendees = users.slice(ORGANISERS);

  // Spread over the past 6 months and the next year; mostly published
  const events = Array.from({ length: EVENTS }, () => {
    const startsAt = new Date(
      now +
        faker.number.int({ min: -180, max: 365 }) * DAY +
        faker.number.int({ min: 0, max: DAY }),
    );
    const online = faker.datatype.boolean(0.3);
    return {
      id: randomUUID(),
      title: faker.company.catchPhrase(),
      description: faker.lorem.paragraph(),
      category: faker.helpers.arrayElement([
        "Tech",
        "Music",
        "Comedy",
        "Food",
        "Sport",
      ]),
      format: online ? ("ONLINE" as const) : ("IN_PERSON" as const),
      status: faker.helpers.weightedArrayElement([
        { weight: 70, value: "PUBLISHED" as const },
        { weight: 20, value: "DRAFT" as const },
        { weight: 10, value: "CANCELLED" as const },
      ]),
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60_000),
      timezone: "Europe/London",
      venueName: online ? null : faker.company.name(),
      venueAddress: online ? null : faker.location.streetAddress(),
      meetingLink: online ? "https://example.com/meet" : null,
      pricePence: faker.helpers.arrayElement([0, 500, 1500, 2500]),
      // Big enough that ~5 small bookings per event never go over the limit
      seatLimit: faker.number.int({ min: 100, max: 500 }),
      organiserId: faker.helpers.arrayElement(organisers).id,
      createdAt: new Date(startsAt.getTime() - 30 * DAY),
    };
  });

  const bookings = Array.from({ length: BOOKINGS }, () => {
    const event = faker.helpers.arrayElement(events);
    const status = faker.helpers.weightedArrayElement([
      { weight: 75, value: "CONFIRMED" as const },
      { weight: 10, value: "HELD" as const },
      { weight: 10, value: "EXPIRED" as const },
      { weight: 5, value: "REFUNDED" as const },
    ]);
    const createdAt = new Date(
      event.createdAt.getTime() + faker.number.int({ min: 0, max: 25 * DAY }),
    );
    return {
      id: randomUUID(),
      seats: faker.number.int({ min: 1, max: 4 }),
      status,
      unitPricePence: event.pricePence,
      // Old holds have run out; a "HELD" row with a past expiry is what
      // expireHolds tidies up when someone opens the page
      holdExpiresAt:
        status === "HELD" || status === "EXPIRED"
          ? new Date(createdAt.getTime() + 5 * 60_000)
          : null,
      reference: `SEED-${randomUUID().slice(0, 13).toUpperCase()}`,
      idempotencyKey: randomUUID(),
      createdAt,
      userId: faker.helpers.arrayElement(attendees).id,
      eventId: event.id,
    };
  });

  const started = performance.now();
  await inBatches(users, (data) => prisma.user.createMany({ data }));
  await inBatches(events, (data) => prisma.event.createMany({ data }));
  await inBatches(bookings, (data) => prisma.booking.createMany({ data }));
  // Fresh statistics, so the planner knows the tables' real size now
  await prisma.$executeRawUnsafe(`ANALYZE "User", "Event", "Booking"`);
  console.log(
    `Added ${users.length} users, ${events.length} events, ${bookings.length} bookings in ${Math.round((performance.now() - started) / 1000)} s`,
  );
}

try {
  if (process.argv.includes("--clean")) await clean();
  else await seed();
} finally {
  await prisma.$disconnect();
}
