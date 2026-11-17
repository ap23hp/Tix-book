import { prisma } from "./prisma.js";
import type { GoogleClaims } from "../schemas/auth.js";

type Result =
  { ok: true; userId: string } | { ok: false; reason: "account-exists" };

// Find the Tixbook user for this Google account, or create one.
export async function findOrCreateGoogleUser(
  claims: GoogleClaims,
): Promise<Result> {
  // 1. Seen this Google account before → same user
  const byGoogleId = await prisma.user.findUnique({
    where: { googleId: claims.sub },
  });
  if (byGoogleId) return { ok: true, userId: byGoogleId.id };

  // 2. Someone already has this email
  const byEmail = await prisma.user.findUnique({
    where: { email: claims.email },
  });

  if (byEmail) {
    // We never checked that the email belongs to whoever set the password.
    // Linking would let that person keep a way in (pre-account hijacking).
    // Same if it's already linked to a different Google account.
    if (byEmail.passwordHash || byEmail.googleId) {
      return { ok: false, reason: "account-exists" };
    }

    // No password and no Google account (e.g. a seeded user): safe to link
    await prisma.user.update({
      where: { id: byEmail.id },
      data: { googleId: claims.sub },
    });
    return { ok: true, userId: byEmail.id };
  }

  // 3. Brand new person → attendee account, no password
  const user = await prisma.user.create({
    data: {
      googleId: claims.sub,
      email: claims.email,
      name: claims.name ?? claims.email.split("@")[0] ?? "Tixbook user",
      role: "ATTENDEE",
    },
  });
  return { ok: true, userId: user.id };
}