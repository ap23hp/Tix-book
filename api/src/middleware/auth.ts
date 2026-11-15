import type { NextFunction, Request, Response } from "express";
import {
  SESSION_COOKIE,
  clearSessionCookieOptions,
  validateSessionToken,
} from "../lib/session.js";

export type AuthUser = NonNullable<
  Awaited<ReturnType<typeof validateSessionToken>>
>;

// Runs before a protected route: who is this? Stores the user, or 401.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  const user =
    typeof token === "string" ? await validateSessionToken(token) : null;

  if (!user) {
    if (typeof token === "string") {
      // Unknown or expired session: remove the useless cookie
      res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions());
    }
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  res.locals.user = user;
  next();
}

// Runs after requireAuth: is this user allowed? Continues, or 403.
export function requireRole(role: AuthUser["role"]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (getUser(res).role !== role) {
      res.status(403).json({ error: "You don't have permission to do this" });
      return;
    }
    next();
  };
}

// Reads the user that requireAuth stored
export function getUser(res: Response): AuthUser {
  const user = res.locals.user as AuthUser | undefined;
  if (!user) {
    throw new Error("getUser() was called on a route without requireAuth");
  }
  return user;
}
