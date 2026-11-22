import { z } from "zod";

// Rules for each field on its own. Kept as a plain object (no superRefine)
// so the edit route can reuse it with .partial().
export const eventFields = z.object({
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
});

// The fields the cross-field rules look at. null is allowed because the
// edit route checks "saved event + changes", and the database stores
// empty optional fields as null.
export type EventRuleInput = {
  startsAt: Date;
  endsAt: Date;
  format: "IN_PERSON" | "ONLINE";
  status?: string;
  venueName?: string | null;
  venueAddress?: string | null;
  meetingLink?: string | null;
};

// Rules that compare fields with each other (decision 007).
// One function, used by both create and edit, so the rules can't drift apart.
export function checkEventRules(
  data: EventRuleInput,
  ctx: z.core.$RefinementCtx,
) {
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
  if (
    data.format === "ONLINE" &&
    data.status === "PUBLISHED" &&
    !data.meetingLink
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["meetingLink"],
      message: "A meeting link is required to publish an online event",
    });
  }
}

export const createEventSchema = eventFields.superRefine(checkEventRules);

// PATCH /api/v1/events/:id: every field is optional (send only what changed).
// Optional fields also accept null, meaning "clear it", e.g. switching an
// event to online clears its venue. status stays DRAFT or PUBLISHED:
// cancelling needs refunds, so it gets its own route in a later phase.
export const updateEventSchema = eventFields.partial().extend({
  doorsAt: z.coerce.date().nullable().optional(),
  venueName: z.string().trim().min(1).nullable().optional(),
  venueAddress: z.string().trim().min(1).nullable().optional(),
  meetingLink: z.string().url().nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
});

// The cross-field rules on their own, for "saved event + changes".
// A partial update can't check them alone: a new endsAt has to be compared
// with the startsAt that's already saved.
export const eventRulesSchema = z
  .custom<EventRuleInput>()
  .superRefine(checkEventRules);

// GET /api/v1/events?q=&category=&format=&limit=&cursor=
// Everything comes from the URL, so it arrives as strings.
export const listEventsQuerySchema = z.object({
  // Text to search for in the title; an empty box means "no search"
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  category: z.string().trim().min(1).max(50).optional(),
  format: z.enum(["IN_PERSON", "ONLINE"]).optional(),
  // "12" → 12; anything outside 1–50 is a 400
  limit: z.coerce.number().int().min(1).max(50).default(12),
  cursor: z.string().max(200).optional(),
});

// GET /api/v1/events/mine?limit=&cursor= (no search or filters yet)
export const myEventsQuerySchema = listEventsQuerySchema.pick({
  limit: true,
  cursor: true,
});
