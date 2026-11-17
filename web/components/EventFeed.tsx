"use client";

import { useEffect, useRef, useState } from "react";
import { EventCard } from "@/components/EventCard";
import {
  daysUntil,
  groupByMonth,
  toQueryString,
  type EventFilters,
} from "@/lib/events";
import { display, label } from "@/lib/ui";
import type { EventPage, EventSummary } from "@/lib/types";

type Props = {
  initialEvents: EventSummary[];
  initialCursor: string | null;
  filters: EventFilters;
  now: string; // from the server, so server and browser count days the same way
};

// The first page comes from the server. "Load more" fetches the next pages
// in the browser and adds them below.
export function EventFeed({
  initialEvents,
  initialCursor,
  filters,
  now,
}: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [cursor, setCursor] = useState(initialCursor);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const requestRef = useRef<AbortController | null>(null);

  // Effect cleanup: if this list goes away (filters changed, page left)
  // while "Load more" is still loading, cancel the request so a late answer
  // can't add old results to a new list.
  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  async function loadMore() {
    if (!cursor || status === "loading") return;

    const controller = new AbortController();
    requestRef.current = controller;
    setStatus("loading");

    try {
      // Relative URL → through the Vercel rewrite, like the login forms
      const res = await fetch(
        `/api/v1/events?${toQueryString({ ...filters, cursor })}`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`Status ${res.status}`);

      const page = (await res.json()) as EventPage;
      setEvents((previous) => [...previous, ...page.events]);
      setCursor(page.nextCursor);
      setStatus("idle");
    } catch {
      if (controller.signal.aborted) return; // we cancelled it on purpose
      setStatus("error");
    }
  }

  const today = new Date(now);

  return (
    <div className="mt-10">
      <div className="space-y-12">
        {groupByMonth(events).map(([month, monthEvents]) => (
          <section key={month}>
            <div className="flex items-end justify-between border-b-2 border-ink pb-2">
              <h2 className={`text-display-sm text-ink ${display}`}>{month}</h2>
              <p className={`text-ink-muted ${label}`}>
                {monthEvents.length}{" "}
                {monthEvents.length === 1 ? "event" : "events"}
              </p>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {monthEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  daysUntil={daysUntil(event.startsAt, today)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Screen readers hear how many events are showing after "Load more" */}
      <p aria-live="polite" className="sr-only">
        Showing {events.length} {events.length === 1 ? "event" : "events"}
      </p>

      {status === "error" && (
        <p role="alert" className="mt-8 text-center text-sm text-accent">
          Couldn&apos;t load more events. Check your connection and try again.
        </p>
      )}

      {cursor && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={status === "loading"}
            className="rounded-full border border-ink px-7 py-3 font-semibold text-ink hover:bg-ink hover:text-surface disabled:opacity-60"
          >
            {status === "loading"
              ? "Loading…"
              : status === "error"
                ? "Try again"
                : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}