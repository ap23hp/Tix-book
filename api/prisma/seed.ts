import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

// ─── Safety guard: only ever seed the dev database ──────────────────────────
// The seed DELETES all data. It only runs if the database host matches
// SEED_ALLOWED_HOST in api/.env (your Neon dev host, e.g. ep-holy-mountain-...).
function assertSafeToSeed() {
  const url = process.env.DATABASE_URL;
  const allowedHost = process.env.SEED_ALLOWED_HOST;

  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }

  const host = new URL(url).hostname;

  if (!allowedHost || host !== allowedHost) {
    throw new Error(
      `Refusing to seed "${host}". The seed deletes all data, so it only runs ` +
        `when the host matches SEED_ALLOWED_HOST in api/.env (your Neon dev host).`,
    );
  }
}

assertSafeToSeed();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// A fixed date at a given hour (UTC).
// All dates are before 28 Mar 2027 (UK clocks change), so UTC = London time.
// ⚠️ These dates will pass eventually — update them before mid-March 2027.
function at(isoDate: string, hour: number, minute = 0) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function makeReference() {
  return "TIX-" + randomUUID().slice(0, 5).toUpperCase();
}

async function main() {
  // Everything inside runs as ONE transaction: if any step fails,
  // all steps are rolled back and the old data stays as it was.
  await prisma.$transaction(
    async (tx) => {
      // 1. Clear old data (children first, because of foreign keys)
      await tx.booking.deleteMany();
      await tx.event.deleteMany();
      await tx.user.deleteMany();

      // 2. Users
      const sam = await tx.user.create({
        data: { name: "Sam K.", email: "sam@example.com", role: "ORGANISER" },
      });
      const lena = await tx.user.create({
        data: { name: "Lena M.", email: "lena@example.com", role: "ORGANISER" },
      });
      const priya = await tx.user.create({
        data: {
          name: "Priya Shah",
          email: "priya@example.com",
          role: "ATTENDEE",
        },
      });
      const tom = await tx.user.create({
        data: { name: "Tom Reid", email: "tom@example.com", role: "ATTENDEE" },
      });
      const ana = await tx.user.create({
        data: { name: "Ana Lopes", email: "ana@example.com", role: "ATTENDEE" },
      });

      // 3. Events
      const comedyStart = at("2027-01-08", 20);
      const comedy = await tx.event.create({
        data: {
          title: "Friday Night Comedy",
          description:
            "Five of London's sharpest new comedians, one tiny upstairs room, and a host who never sticks to the script. Expect new material, a little crowd work and a lot of laughing. Grab a drink downstairs before doors open.\n\nAges 18+. Contains strong language.",
          category: "Comedy",
          format: "IN_PERSON",
          status: "PUBLISHED",
          startsAt: comedyStart,
          endsAt: addHours(comedyStart, 2),
          doorsAt: addHours(comedyStart, -0.5),
          timezone: "Europe/London",
          venueName: "The Lantern Rooms",
          venueAddress: "12 Market St, Camden, London",
          pricePence: 1200,
          seatLimit: 30,
          organiserId: sam.id,
        },
      });

      const webinarStart = at("2027-01-19", 13);
      const webinar = await tx.event.create({
        data: {
          title: "Small Business Marketing Webinar",
          description:
            "A practical one-hour session for small business owners who want more customers without a big budget. We'll cover simple social media habits, getting found on Google, and writing emails people actually open.\n\nBring your questions: the last 15 minutes are open Q&A.",
          category: "Business",
          format: "ONLINE",
          status: "PUBLISHED",
          startsAt: webinarStart,
          endsAt: addHours(webinarStart, 1),
          timezone: "Europe/London",
          meetingLink: "https://meet.example.com/marketing-webinar",
          pricePence: 0,
          seatLimit: 30,
          organiserId: sam.id,
        },
      });

      const jazzStart = at("2027-01-30", 20);
      const jazz = await tx.event.create({
        data: {
          title: "Live Jazz Night",
          description:
            "An intimate evening with a trio playing classic standards and a few originals. Candlelit tables, a small bar, and the kind of room where you can hear every note.\n\nSeating is limited, so book early.",
          category: "Music",
          format: "IN_PERSON",
          status: "PUBLISHED",
          startsAt: jazzStart,
          endsAt: addHours(jazzStart, 3),
          doorsAt: addHours(jazzStart, -0.5),
          timezone: "Europe/London",
          venueName: "Blue Room",
          venueAddress: "4 River Lane, Hackney, London",
          pricePence: 1500,
          seatLimit: 2, // small on purpose, so it's sold out
          organiserId: lena.id,
        },
      });

      const jsStart = at("2027-02-16", 19);
      await tx.event.create({
        data: {
          title: "JavaScript Basics for Beginners",
          description:
            "Never written code before? This friendly two-hour session takes you from zero to your first working JavaScript program. We'll cover variables, functions and making a web page respond to a click, step by step.\n\nAll you need is a laptop and a browser.",
          category: "Workshops",
          format: "ONLINE",
          status: "PUBLISHED",
          startsAt: jsStart,
          endsAt: addHours(jsStart, 2),
          timezone: "Europe/London",
          meetingLink: "https://meet.example.com/js-basics",
          pricePence: 0,
          seatLimit: 20,
          organiserId: lena.id,
        },
      });

      const potteryStart = at("2027-03-13", 10);
      await tx.event.create({
        data: {
          title: "Beginner Pottery Workshop",
          description:
            "Get your hands muddy at the wheel. You'll learn centring, shaping and trimming, and leave with two pieces of your own. All materials and firing are included.",
          category: "Workshops",
          format: "IN_PERSON",
          status: "DRAFT", // not visible to attendees
          startsAt: potteryStart,
          endsAt: addHours(potteryStart, 3),
          timezone: "Europe/London",
          pricePence: 2500,
          seatLimit: 12,
          organiserId: sam.id,
        },
      });

      const pitchStart = at("2027-02-24", 18);
      await tx.event.create({
        data: {
          title: "Startup Pitch Night",
          description:
            "Six early-stage founders pitch to a panel of local investors, followed by networking. Great for anyone curious about how startups raise their first money.",
          category: "Business",
          format: "IN_PERSON",
          status: "CANCELLED",
          startsAt: pitchStart,
          endsAt: addHours(pitchStart, 2),
          timezone: "Europe/London",
          venueName: "Hub 9",
          venueAddress: "9 Tech Yard, Shoreditch, London",
          pricePence: 500,
          seatLimit: 50,
          organiserId: lena.id,
        },
      });

      // 4. Bookings
      await tx.booking.create({
        data: {
          seats: 2,
          status: "CONFIRMED",
          unitPricePence: comedy.pricePence,
          reference: makeReference(),
          idempotencyKey: randomUUID(),
          userId: priya.id,
          eventId: comedy.id,
        },
      });

      await tx.booking.create({
        data: {
          seats: 1,
          status: "CONFIRMED",
          unitPricePence: webinar.pricePence,
          reference: makeReference(),
          idempotencyKey: randomUUID(),
          userId: tom.id,
          eventId: webinar.id,
        },
      });

      await tx.booking.create({
        data: {
          seats: 2, // fills both seats → sold out
          status: "CONFIRMED",
          unitPricePence: jazz.pricePence,
          reference: makeReference(),
          idempotencyKey: randomUUID(),
          userId: ana.id,
          eventId: jazz.id,
        },
      });
    },
    // Default timeout is short; Neon may need a moment to wake up.
    // A sleeping Neon compute can delay the start (maxWait),
    // and ~15 queries over the network take time to run (timeout).
    { maxWait: 10_000, timeout: 20_000 },
  );

  console.log("Seed complete: 5 users, 6 events, 3 bookings");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
