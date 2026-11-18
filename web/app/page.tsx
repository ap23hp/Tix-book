import { Suspense } from "react";
import Link from "next/link";
import { EventFeed } from "@/components/EventFeed";
import { EventFilters } from "@/components/EventFilters";
import { EventListSkeleton } from "@/components/Skeletons";
import { EmptyTicket } from "@/components/Illustrations";
import { buttonClass } from "@/components/ui/Button";
import { getEvents } from "@/lib/api";
import { readFilters, toQueryString } from "@/lib/events";
import { display } from "@/lib/ui";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-300 px-6 py-10">
      {/* Static: part of the prerendered shell */}
      <h1 className={`text-display-lg text-ink ${display}`}>Upcoming events</h1>

      {/* Live: depends on the URL (?q=…&format=…), so it waits inside Suspense */}
      <Suspense fallback={<EventListSkeleton />}>
        <Events searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Events({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  const filters = readFilters(await searchParams);
  const { events, nextCursor } = await getEvents(filters);
  const hasFilters = Boolean(filters.q || filters.category || filters.format);

  return (
    <>
      <EventFilters initial={filters} />

      {events.length === 0 ? (
        hasFilters ? (
          <NoMatches />
        ) : (
          <NoEvents />
        )
      ) : (
        // key: new filters → a fresh list (old "Load more" pages are dropped)
        <EventFeed
          key={toQueryString(filters)}
          initialEvents={events}
          initialCursor={nextCursor}
          filters={filters}
          now={new Date().toISOString()}
        />
      )}
    </>
  );
}

function NoEvents() {
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <EmptyTicket />
      <h2 className={`mt-6 text-display-md text-ink ${display}`}>
        No upcoming events
      </h2>
      <p className="mt-2 max-w-sm text-ink-soft">
        Nothing on the calendar right now. New events will show up here as soon
        as they&apos;re added.
      </p>
    </div>
  );
}

function NoMatches() {
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <EmptyTicket />
      <h2 className={`mt-6 text-display-md text-ink ${display}`}>
        No events match
      </h2>
      <p className="mt-2 max-w-sm text-ink-soft">
        Try a different word, or remove a filter.
      </p>
      <Link href="/" className={buttonClass({ className: "mt-6" })}>
        Show all events
      </Link>
    </div>
  );
}
