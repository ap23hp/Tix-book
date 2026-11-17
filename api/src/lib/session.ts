import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions } from "express";
import { prisma } from "./prisma.js";

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

// Same flags for setting and clearing (the browser only clears a cookie
// if path/flags match the one it was set with)
const baseCookieOptions: CookieOptions = {
  httpOnly: true, // JavaScript in the browser can't read it (protects against XSS)
  secure: true, // only sent over HTTPS (localhost counts as secure in Chrome)
  sameSite: "lax", // not sent on most cross-site requests (helps against CSRF)
  path: "/",
};

// 32 random bytes = 256 bits. Impossible to guess.
function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// The database stores this hash, never the token itself
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// A new random token, the hash to store as Session.id, and the expiry.
// Doesn't save anything, so it can be used inside a transaction.
export function newSessionToken() {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return { token, id: hashToken(token), expiresAt };
}

export async function createSession(userId: string) {
  const { token, id, expiresAt } = newSessionToken();

  await prisma.session.create({
    data: { id, userId, expiresAt },
  });

  return { token, expiresAt };
}
// Returns the logged-in user, or null if the token is unknown or expired
export async function validateSessionToken(token: string) {
  const id = hashToken(token);

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    // deleteMany doesn't throw if another request already deleted it
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }

  return session.user;
}

export async function invalidateSession(token: string) {
  await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}

export function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return { ...baseCookieOptions, expires: expiresAt };
}

export function clearSessionCookieOptions(): CookieOptions {
  return baseCookieOptions;
}
