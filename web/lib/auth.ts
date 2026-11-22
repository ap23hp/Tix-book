import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@/lib/types";

const API_URL = process.env.API_URL;

// Must match SESSION_COOKIE in api/src/lib/session.ts
export const SESSION_COOKIE = "session";

// Who is logged in? Runs on the Next.js server, never in the browser.
// cache() = if the header and a page both ask in the same request, call the API once.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  // No cookie → not logged in. Skip the API call.
  if (!token) return null;

  if (!API_URL) {
    throw new Error("API_URL is not set. Add it to web/.env.local");
  }

  // Server-to-server call: the browser's cookie isn't sent automatically,
  // so forward it by hand.
  const res = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: { Cookie: `${SESSION_COOKIE}=${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  // 401 = cookie expired, logged out, or fake
  if (res.status === 401) return null;

  if (!res.ok) {
    throw new Error(`Couldn't check login: ${res.status}`);
  }

  return res.json() as Promise<User>;
});
