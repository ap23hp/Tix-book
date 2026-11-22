import { z } from "zod";

// The most seats one booking can hold (decision 037)
export const MAX_SEATS_PER_BOOKING = 10;

// POST /api/v1/events/:id/bookings
export const holdSeatsSchema = z.object({
  seats: z.number().int().min(1).max(MAX_SEATS_PER_BOOKING),
  // Made by the browser once, when the booking dialog opens, and sent again
  // with every retry, so a double click or a repeated request is one booking
  // (decision 010)
  idempotencyKey: z.uuid(),
});
