import { Suspense } from "react";
import { connection } from "next/server";
import { EventCard } from "@/components/EventCard";
import { EventListSkeleton } from "@/components/Skeletons";
import { EmptyTicket } from "@/components/Illustrations";
import { getEvents } from "@/lib/api";
import { display, label } from "@/lib/ui";
import type { EventSummary } from "@/lib/types";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-300 px-6 py-10">
      {/* Static: part of the prerendered shell */}
      <h1 className={`text-display-lg text-ink ${display}`}>Upcoming events</h1>

      {/* Live: fetched per request, skeleton shown while waiting */}
      <Suspense fallback={<EventListSkeleton />}>
        <EventList />
      </Suspense>
    </div>
  );
}

async function EventList() {
  await connection(); // render at request time, so "today" is really today
  const events = await getEvents();
  const now = new Date();

  if (events.length === 0) {
    return (
      <div className="mt-12 flex flex-col items-center text-center">
        <EmptyTicket />
        <h2 className={`mt-6 text-display-md text-ink ${display}`}>No upcoming events</h2>
        <p className="mt-2 max-w-sm text-ink-soft">
          Nothing on the calendar right now. New events will show up here as soon as
          they&apos;re added.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-12">
      {groupByMonth(events).map(([month, monthEvents]) => (
        <section key={month}>
          <div className="flex items-end justify-between border-b-2 border-ink pb-2">
            <h2 className={`text-display-sm text-ink ${display}`}>{month}</h2>
            <p className={`text-ink-muted ${label}`}>
              {monthEvents.length} {monthEvents.length === 1 ? "event" : "events"}
            </p>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {monthEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                daysUntil={daysUntil(event.startsAt, now)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// The API already sorts soonest first, and a Map keeps insertion order,
// so months come out in the right order.
function groupByMonth(events: EventSummary[]) {
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

function daysUntil(iso: string, now: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / msPerDay);
}