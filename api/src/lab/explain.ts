// LAB SCRIPT (phase 7b): EXPLAIN ANALYZE for the queries behind our list
// pages, to compare plans before and after adding indexes.
// Run (from api/): npm run lab:explain   (after npm run lab:seed)
//
// Only SELECTs: EXPLAIN ANALYZE really runs the query, so a write here would
// write. The SQL is written to match what Prisma sends for each route (same
// WHERE, ORDER BY and LIMIT), with values passed as parameters.
// Each query runs RUNS times; the table shows the median execution time
// (Postgres's own time, without the network) and the plan's top steps.
import "dotenv/config";
import { assertDevDatabase } from "./dev-only.js";

assertDevDatabase();
const { prisma } = await import("../lib/prisma.js");

const RUNS = 7;

type Query = { name: string; route: string; sql: string; params: unknown[] };

async function sampleIds() {
  const [organiser] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "organiserId" AS id FROM "Event" GROUP BY "organiserId" ORDER BY count(*) DESC LIMIT 1`,
  );
  const [attendee] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "userId" AS id FROM "Booking" GROUP BY "userId" ORDER BY count(*) DESC LIMIT 1`,
  );
  const [busy] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "eventId" AS id FROM "Booking" GROUP BY "eventId" ORDER BY count(*) DESC LIMIT 1`,
  );
  const page = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "Event" WHERE status = 'PUBLISHED' AND "startsAt" > now()
     ORDER BY "startsAt", id LIMIT 12`,
  );
  if (!organiser || !attendee || !busy)
    throw new Error("Run npm run lab:seed first");
  return {
    organiser: organiser.id,
    attendee: attendee.id,
    busy: busy.id,
    page: page.map((r) => r.id),
  };
}

function queries(ids: Awaited<ReturnType<typeof sampleIds>>): Query[] {
  const now = new Date();
  return [
    {
      name: "Public list (first page)",
      route: "GET /events",
      sql: `SELECT * FROM "Event" WHERE status = 'PUBLISHED' AND "startsAt" > $1
            ORDER BY "startsAt" ASC, id ASC LIMIT 13`,
      params: [now],
    },
    {
      name: "My events (organiser)",
      route: "GET /events/mine",
      sql: `SELECT * FROM "Event" WHERE "organiserId" = $1
            ORDER BY "startsAt" DESC, id DESC LIMIT 13`,
      params: [ids.organiser],
    },
    {
      name: "My tickets",
      route: "GET /bookings/mine",
      sql: `SELECT * FROM "Booking" WHERE "userId" = $1
            ORDER BY "createdAt" DESC, id DESC LIMIT 50`,
      params: [ids.attendee],
    },
    {
      name: "Seats taken, one page",
      route: "seatsTakenByEvent",
      sql: `SELECT "eventId", sum(seats) FROM "Booking"
            WHERE "eventId" = ANY($1::text[])
              AND (status = 'CONFIRMED' OR (status = 'HELD' AND ("holdExpiresAt" IS NULL OR "holdExpiresAt" > $2)))
            GROUP BY "eventId"`,
      params: [ids.page, now],
    },
    {
      name: "Organiser bookings",
      route: "GET /events/mine/:id/bookings",
      sql: `SELECT * FROM "Booking" WHERE "eventId" = $1
            ORDER BY "createdAt" DESC, id DESC LIMIT 201`,
      params: [ids.busy],
    },
  ];
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function explain(query: Query) {
  const times: number[] = [];
  let plan: string[] = [];
  for (let i = 0; i < RUNS; i++) {
    const rows = await prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
      `EXPLAIN (ANALYZE, BUFFERS) ${query.sql}`,
      ...query.params,
    );
    plan = rows.map((r) => r["QUERY PLAN"]);
    const line = plan.find((l) => l.startsWith("Execution Time"));
    times.push(Number(line?.match(/([\d.]+) ms/)?.[1]));
  }
  return { times, plan };
}

try {
  const ids = await sampleIds();
  const counts = await prisma.$queryRawUnsafe<
    { events: bigint; bookings: bigint }[]
  >(
    `SELECT (SELECT count(*) FROM "Event") AS events, (SELECT count(*) FROM "Booking") AS bookings`,
  );
  console.log(
    `Rows: ${counts[0]!.events} events, ${counts[0]!.bookings} bookings; ${RUNS} runs each\n`,
  );
  const summary = [];
  for (const query of queries(ids)) {
    const { times, plan } = await explain(query);
    console.log(`=== ${query.name} (${query.route})`);
    console.log(
      plan
        .filter((l) => !l.startsWith("Planning") && !l.startsWith("Execution"))
        .join("\n"),
    );
    console.log();
    // The first plan line, without costs: "Limit", "Sort", "Index Scan ..."
    const steps = plan
      .filter(
        (l) =>
          /^\s*(->\s*)?[A-Z]/.test(l) &&
          !/^(Planning|Execution|Buffers)/.test(l.trim()),
      )
      .map((l) =>
        l
          .replace(/^\s*->\s*/, "")
          .replace(/\s+\(cost.*$/, "")
          .trim(),
      )
      .filter(
        (l) =>
          !/^(Sort Key|Sort Method|Buffers|Filter|Index Cond|Rows Removed|Group Key|Recheck|Heap Blocks|Presorted|Full-sort|Worker|Workers)/.test(
            l,
          ),
      );
    summary.push({
      query: query.name,
      "median ms": median(times),
      "min ms": Math.min(...times),
      plan: steps.slice(0, 3).join(" → "),
    });
  }
  console.table(summary);
} finally {
  await prisma.$disconnect();
}
