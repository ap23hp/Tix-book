import type { Prisma } from "../generated/prisma/client.js";
import { QUEUES, startJobs } from "../lib/jobs.js";
import { prisma } from "../lib/prisma.js";

// Tests run in their own pg-boss schema (pgboss_test, lib/jobs.ts), so no
// worker ever sends these jobs. Each file still deletes the jobs it made.

export async function emailJobsFor(bookingId: string) {
  const boss = await startJobs();
  return boss.findJobs(QUEUES.bookingConfirmed, { data: { bookingId } });
}

export async function deleteEmailJobsFor(where: Prisma.BookingWhereInput) {
  const bookings = await prisma.booking.findMany({
    where,
    select: { id: true },
  });
  const boss = await startJobs();
  for (const { id } of bookings) {
    const jobs = await emailJobsFor(id);
    if (jobs.length > 0) {
      await boss.deleteJob(
        QUEUES.bookingConfirmed,
        jobs.map((job) => job.id),
      );
    }
  }
}
