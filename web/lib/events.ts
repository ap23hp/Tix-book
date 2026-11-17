// Helpers for the event list, used by both the server page and client components.
import type { EventSummary } from "@/lib/types";

export const CATEGORIES = ["Comedy", "Music", "Business", "Workshops"];

export const FORMATS = [
  { value: "IN_PERSON", label: "In person" },
  { value: "ONLINE", label: "Online" },
];

export type EventFilters = {
  q?: string;
  category?: string;
  format?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

// The URL can contain anything (?format=PARTY, ?q=… 5000 characters).
// Keep only values the API accepts, so a bad link shows results, not an error page.
export function readFilters(searchParams: SearchParams): EventFilters {
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

  const q = first(searchParams.q).slice(0, 100);
  const category = first(searchParams.category);
  const format = first(searchParams.format);

  return {
    q: q || undefined,
    category: CATEGORIES.includes(category) ? category : undefined,
    format: FORMATS.some((f) => f.value === format) ? format : undefined,
  };
}

// { q: "jazz", format: "ONLINE" } → "q=jazz&format=ONLINE" (empty values left out)
export function toQueryString(
  values: EventFilters & { cursor?: string | null },
): string {
  const params = new URLSearchParams();
  for (const key of ["q", "category", "format", "cursor"] as const) {
    const value = values[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

// "January 2027" → events in that month. The API sorts soonest first, and a
// Map keeps insertion order, so months come out in the right order.
export function groupByMonth(events: EventSummary[]) {
  const groups = new Map<string, EventSummary[]>();

  for (const event of events) {
    const month = new Intl.DateTimeFormat("en-GB", {
      timeZone: event.timezone,
      month: "long",
      year: "numeric",
    }).format(new Date(event.startsAt));

    const list = groups.get(month) ?? [];
    list.push(event);
    groups.set(month, list);
  }

  return [...groups.entries()];
}

export function daysUntil(iso: string, now: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / msPerDay);
}