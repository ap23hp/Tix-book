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

// What we need from Google's ID token. Google only sends these after the
// user signs in, and email_verified must be true or we can't trust the email.
export const googleClaimsSchema = z.object({
  sub: z.string().min(1), // Google's permanent ID for this account
  email,
  email_verified: z.literal(true),
  name: z.string().trim().min(1).max(100).optional(),
});

export type GoogleClaims = z.infer<typeof googleClaimsSchema>;