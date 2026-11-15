import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
  role: z.enum(["ATTENDEE", "ORGANISER"]).default("ATTENDEE"),
});
