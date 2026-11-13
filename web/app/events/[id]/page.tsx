import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverArt } from "@/components/CoverArt";
import { getEvent } from "@/lib/api";
import {
  formatDateParts,
  formatInZone,
  formatPrice,
  formatTimeRange,
} from "@/lib/format";
import { display, label } from "@/lib/ui";
import { EventDetailSkeleton } from "@/components/Skeletons";
export default function EventPage({ params }: PageProps<"/events/[id]">) {
  return (
    <div className="mx-auto w-full max-w-300 px-6 py-8">
      <Link href="/" className={`text-ink-muted hover:text-ink ${label}`}>
        <span aria-hidden="true">← </span>All events
      </Link>
          <Suspense fallback={<EventDetailSkeleton />}>
        <EventDetails params={params} />
      </Suspense>
    </div>
  );
}

async function EventDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) notFound();

  const isOnline = event.format === "ONLINE";
  const soldOut = event.seatsLeft <= 0;

  // Seats bar shows seats TAKEN (design note). Clamp to 0–100%.
  const taken = Math.min(
    Math.max(event.seatLimit - event.seatsLeft, 0),
    event.seatLimit,
  );
  const takenPercent =
    event.seatLimit > 0 ? (taken / event.seatLimit) * 100 : 100;

  const { day, month, weekday, year, time } = formatDateParts(
    event.startsAt,
    event.timezone,
  );
  const longDate = formatInZone(event.startsAt, event.timezone, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <article className="mt-6">
      <CoverArt
        category={event.category}
        format={event.format}
        className="h-44 rounded-ticket-lg sm:h-56"
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px] lg:items-start">
        {/* Left: details */}
        <div>
          <h1
            className={`text-display-md text-ink lg:text-display-xl ${display}`}
          >
            {event.title}
          </h1>

          <dl className="mt-6 grid border-t-2 border-ink sm:grid-cols-2 sm:gap-x-6">
            <Detail term="Date">{longDate}</Detail>
            <Detail term="Time">
              {formatTimeRange(event.startsAt, event.endsAt, event.timezone)}
            </Detail>

            {isOnline ? (
              <Detail term="Format">Online — link sent after booking</Detail>
            ) : (
              <Detail term="Venue">
                <span className="font-semibold">
                  {event.venueName ?? "Venue to be announced"}
                </span>
                {event.venueAddress && (
                  <span className="block text-ink-muted">
                    {event.venueAddress}
                  </span>
                )}
              </Detail>
            )}

            {event.doorsAt && (
              <Detail term="Doors">
                {formatInZone(event.doorsAt, event.timezone, {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </Detail>
            )}
          </dl>

          <h2 className={`mt-10 text-display-sm text-ink ${display}`}>About</h2>
          <p className="mt-3 max-w-prose whitespace-pre-line text-ink-soft">
            {event.description}
          </p>
        </div>

        {/* Right: booking ticket */}
        <aside
          aria-label="Tickets"
          className="ticket rounded-ticket lg:sticky lg:top-8"
        >
          <div className="ticket-notched flex flex-col rounded-ticket bg-surface">
            <div className="p-5">
              <p className={`text-ink-muted ${label}`}>Admit one</p>
              <p className="mt-2 flex items-baseline gap-2">
                <span className={`text-display-md text-ink ${display}`}>
                  {formatPrice(event.pricePence)}
                </span>
                <span className="text-sm text-ink-muted">
                  {event.pricePence === 0 ? "No charge" : "per ticket"}
                </span>
              </p>

              <div className="mt-4 flex items-baseline justify-between">
                <span className={`text-ink-muted ${label}`}>Seats</span>
                <span className="text-sm font-semibold text-ink">
                  {soldOut
                    ? "Sold out"
                    : `${event.seatsLeft} of ${event.seatLimit} left`}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
              >
                <div
                  className="h-full origin-left animate-fill rounded-full bg-accent motion-reduce:animate-none"
                  style={{ width: `${takenPercent}%` }}
                />
              </div>

              <button
                type="button"
                disabled
                className="mt-5 w-full rounded-full bg-line py-3 font-semibold text-ink-muted"
              >
                {soldOut ? "Sold out" : "Booking opens soon"}
              </button>
            </div>

            <div
              aria-hidden="true"
              className="mx-5 border-t-2 border-dashed border-perf"
            />

            <div className="flex h-20 items-center gap-3 px-5">
              <span className={`text-display-lg text-ink ${display}`}>
                {day}
              </span>
              <span className={`flex flex-col text-ink-muted ${label}`}>
                <span>
                  {month} {year}
                </span>
                <span>
                  {weekday} · {time}
                </span>
              </span>
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="border-b border-line py-4">
      <dt className={`text-ink-muted ${label}`}>{term}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}
