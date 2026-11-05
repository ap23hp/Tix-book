import { z } from "zod";

export const createEventSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1),
    category: z.string().trim().min(1),
    format: z.enum(["IN_PERSON", "ONLINE"]),
    status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    doorsAt: z.coerce.date().optional(),
    timezone: z.string().min(1),
    venueName: z.string().trim().min(1).optional(),
    venueAddress: z.string().trim().min(1).optional(),
    meetingLink: z.string().url().optional(),
    pricePence: z.number().int().min(0),
    seatLimit: z.number().int().min(1).max(10000),
    coverImageUrl: z.string().url().optional(),
    organiserId: z.string().min(1), // TODO phase 2: take from logged-in user instead
  })
  .superRefine((data, ctx) => {
    if (data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End time must be after start time",
      });
    }
    if (data.format === "IN_PERSON" && (!data.venueName || !data.venueAddress)) {
      ctx.addIssue({
        code: "custom",
        path: ["venueName"],
        message: "Venue name and address are required for in-person events",
      });
    }
    if (data.format === "ONLINE" && data.status === "PUBLISHED" && !data.meetingLink) {
      ctx.addIssue({
        code: "custom",
        path: ["meetingLink"],
        message: "A meeting link is required to publish an online event",
      });
    }
  });