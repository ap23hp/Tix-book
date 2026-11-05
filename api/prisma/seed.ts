import "dotenv/config";
import { randomUUID } from "node:crypto";
import { faker } from "@faker-js/faker";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

faker.seed(42); // same fake data every run

// A date X days from now, at a given hour (UTC)
function daysFromNow(days: number, hour: number, minute = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
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
  // 1. Clear old data (children first, because of foreign keys)
  await prisma.booking.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  // 2. Users
  const sam = await prisma.user.create({
    data: { name: "Sam K.", email: "sam@example.com", role: "ORGANISER" },
  });
  const lena = await prisma.user.create({
    data: { name: "Lena M.", email: "lena@example.com", role: "ORGANISER" },
  });
  const priya = await prisma.user.create({
    data: { name: "Priya Shah", email: "priya@example.com", role: "ATTENDEE" },
  });
  const tom = await prisma.user.create({
    data: { name: "Tom Reid", email: "tom@example.com", role: "ATTENDEE" },
  });
  const ana = await prisma.user.create({
    data: { name: "Ana Lopes", email: "ana@example.com", role: "ATTENDEE" },
  });

  // 3. Events
  const comedyStart = daysFromNow(3, 20);
  const comedy = await prisma.event.create({
    data: {
      title: "Friday Night Comedy",
      description: faker.lorem.paragraph(),
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

  const webinarStart = daysFromNow(7, 13);
  const webinar = await prisma.event.create({
    data: {
      title: "Small Business Marketing Webinar",
      description: faker.lorem.paragraph(),
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

  const jazzStart = daysFromNow(9, 20);
  const jazz = await prisma.event.create({
    data: {
      title: "Live Jazz Night",
      description: faker.lorem.paragraph(),
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

  const jsStart = daysFromNow(15, 19);
  await prisma.event.create({
    data: {
      title: "JavaScript Basics for Beginners",
      description: faker.lorem.paragraph(),
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

  const potteryStart = daysFromNow(18, 10);
  await prisma.event.create({
    data: {
      title: "Beginner Pottery Workshop",
      description: faker.lorem.paragraph(),
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

  const pitchStart = daysFromNow(12, 18);
  await prisma.event.create({
    data: {
      title: "Startup Pitch Night",
      description: faker.lorem.paragraph(),
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
  await prisma.booking.create({
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

  await prisma.booking.create({
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

  await prisma.booking.create({
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
