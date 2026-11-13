import Link from "next/link";
import { CoverArt } from "@/components/CoverArt";
import { formatDateParts, formatPrice } from "@/lib/format";
import { display, label } from "@/lib/ui";
import type { EventSummary } from "@/lib/types";

export function EventCard({
  event,
  daysUntil,
}: {
  event: EventSummary;
  daysUntil: number;
}) {
  const { day, month, weekday, time } = formatDateParts(event.startsAt, event.timezone);
  const isOnline = event.format === "ONLINE";

  return (
    <Link
      href={`/events/${event.id}`}
      className="ticket flex flex-col rounded-ticket transition duration-160 ease-ticket hover:-translate-y-1 focus-visible:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <article className="ticket-notched flex flex-1 flex-col rounded-ticket bg-surface">
        <CoverArt category={event.category} format={event.format} className="h-36 rounded-t-ticket" />

        {/* Details */}
        <div className="px-5 pb-3 pt-4">
          <h3 className={`text-display-sm text-ink ${display}`}>{event.title}</h3>
          <p className="mt-3 text-sm text-ink-muted">{time}</p>
          <p className="text-sm text-ink-muted">
            {isOnline ? "Online" : `In person · ${event.venueName ?? "Venue to be announced"}`}
          </p>
        </div>

        {/* Perforation: mt-auto pushes it and the stub to the bottom */}
        <div aria-hidden="true" className="mx-5 mt-auto border-t-2 border-dashed border-perf" />

        {/* Stub: fixed 80px height so the notches line up with the perforation */}
        <div className="flex h-20 items-center justify-between px-5">
          <time dateTime={event.startsAt} className="flex items-center gap-2">
            <span className={`text-display-lg text-ink ${display}`}>{day}</span>
            <span className={`flex flex-col text-ink-muted ${label}`}>
              <span>{month}</span>
              <span>{weekday}</span>
            </span>
          </time>
          <div className="text-right">
            <p className={`text-display-sm text-ink ${display}`}>{formatPrice(event.pricePence)}</p>
            <p className={`mt-1 text-ink-muted ${label}`}>
              {daysUntil <= 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`}
            </p>
          </div>
        </div>
      </article>
    </Link>
  );
}