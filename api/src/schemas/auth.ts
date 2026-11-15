import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email());

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password: z.string().min(8).max(128),
  role: z.enum(["ATTENDEE", "ORGANISER"]).default("ATTENDEE"),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
