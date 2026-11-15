import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions } from "express";
import { prisma } from "./prisma.js";

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

// 32 random bytes = 256 bits. Impossible to guess.
function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// The database stores this hash, never the token itself
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt },
  });

  return { token, expiresAt };
}

export function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true, // JavaScript in the browser can't read it (protects against XSS)
    secure: true, // only sent over HTTPS (localhost counts as secure in Chrome)
    sameSite: "lax", // not sent on most cross-site requests (helps against CSRF)
    path: "/",
    expires: expiresAt,
  };
}
