import type { EventSummary } from "@/components/EventCard";

const API_URL = process.env.API_URL;

// Render's free plan can take ~1 minute to wake up.
// Give up after 10 seconds so the error page ("server may be waking up") can show.
const TIMEOUT_MS = 10_000;

export async function fetchJson<T>(path: string): Promise<T> {
  if (!API_URL) {
    throw new Error("API_URL is not set. Add it to web/.env.local");
  }

  const res = await fetch(`${API_URL}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${path}`);
  }

  return res.json() as Promise<T>;
}

export function getEvents() {
  return fetchJson<EventSummary[]>("/api/v1/events");
}