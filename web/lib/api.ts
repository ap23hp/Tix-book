import type { EventDetail, EventSummary } from "@/lib/types";

const API_URL = process.env.API_URL;

// Render's free plan can take ~1 minute to wake up.
// Give up after 10 seconds so the error page ("server may be waking up") can show.
const TIMEOUT_MS = 10_000;

// An error that remembers the HTTP status code (404, 500…)
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function fetchJson<T>(path: string): Promise<T> {
  if (!API_URL) {
    throw new Error("API_URL is not set. Add it to web/.env.local");
  }

  const res = await fetch(`${API_URL}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new ApiError(res.status, `API request failed: ${res.status} ${path}`);
  }

  return res.json() as Promise<T>;
}

export function getEvents() {
  return fetchJson<EventSummary[]>("/api/v1/events");
}

// Returns null when the event doesn't exist, so the page can show "not found"
export async function getEvent(id: string): Promise<EventDetail | null> {
  try {
    return await fetchJson<EventDetail>(`/api/v1/events/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}