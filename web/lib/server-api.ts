import "server-only";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth";
import type { MyEvent, MyEventPage } from "@/lib/types";

// The most "My events" shows at once (the API's maximum page size)
export const MY_EVENTS_LIMIT = 50;

// Like fetchJson in lib/api.ts, but as the logged-in user.
// A server-to-server fetch doesn't send the browser's cookies, so forward
// the session cookie by hand. Reads cookies(): call it inside <Suspense>.
export async function fetchAsUser<T>(path: string): Promise<T> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    throw new Error("API_URL is not set. Add it to web/.env.local");
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // No cookie: the API would say 401, so don't make the call
  if (!token) throw new ApiError(401, `Not logged in: ${path}`);

  const res = await fetch(`${apiUrl}${path}`, {
    headers: { Cookie: `${SESSION_COOKIE}=${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new ApiError(res.status, `API request failed: ${res.status} ${path}`);
  }

  return res.json() as Promise<T>;
}

export function getMyEvents() {
  return fetchAsUser<MyEventPage>(
    `/api/v1/events/mine?limit=${MY_EVENTS_LIMIT}`,
  );
}

// null when the event doesn't exist OR isn't mine (the API says 404 for both)
export async function getMyEvent(id: string): Promise<MyEvent | null> {
  try {
    return await fetchAsUser<MyEvent>(
      `/api/v1/events/mine/${encodeURIComponent(id)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
