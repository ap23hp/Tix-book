import type { Prisma } from "../generated/prisma/client.js";
import { QUEUES, startJobs } from "../lib/jobs.js";
import { prisma } from "../lib/prisma.js";

// Tests run in their own pg-boss schema (pgboss_test, lib/jobs.ts), so no
// worker ever sends these jobs. Each file still deletes the jobs it made.

const EMAIL_QUEUES = [QUEUES.bookingConfirmed, QUEUES.eventReminder];

export async function emailJobsFor(
  bookingId: string,
  queue: string = QUEUES.bookingConfirmed,
) {
  const boss = await startJobs();
  return boss.findJobs(queue, { data: { bookingId } });
}

export async function deleteEmailJobsFor(where: Prisma.BookingWhereInput) {
  const bookings = await prisma.booking.findMany({
    where,
    select: { id: true },
  });
  const boss = await startJobs();
  for (const { id } of bookings) {
    for (const queue of EMAIL_QUEUES) {
      const jobs = await emailJobsFor(id, queue);
      if (jobs.length > 0) {
        await boss.deleteJob(
          queue,
          jobs.map((job) => job.id),
        );
      }
    }
  }
}
