import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatInZone } from "@/lib/format";
import type { EventStatus, MyEventListItem } from "@/lib/types";
import { display } from "@/lib/ui";

const STATUS: Record<EventStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PUBLISHED: { label: "Published", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "accent" },
};

type Props = {
  events: MyEventListItem[];
  // true when the organiser has more events than one page shows
  hasMore: boolean;
  limit: number;
};

// The organiser's own events. A plain (sync) component, so it can be unit
// tested; the page around it does the data loading.
export function MyEventsList({ events, hasMore, limit }: Props) {
  if (events.length === 0) {
    return (
      <Card className="mt-8 text-center">
        <p className="text-ink-soft">
          You haven&apos;t created any events yet.
        </p>
        <Link href="/events/new" className={buttonClass({ className: "mt-4" })}>
          Create your first event
        </Link>
      </Card>
    );
  }

  return (
    <>
      <ul className="mt-8 flex flex-col gap-4">
        {events.map((event) => {
          const status = STATUS[event.status];
          return (
            <li key={event.id}>
              <Card
                as="article"
                className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <h2 className={`mt-2 text-display-sm text-ink ${display}`}>
                    {event.title}
                  </h2>
                  {/* Shown in the event's own time zone, like the event page */}
                  <p className="mt-1 text-sm text-ink-muted">
                    {formatInZone(event.startsAt, event.timezone, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                  </p>
                  {/* Drafts can't be booked yet, so no numbers for them */}
                  {event.status !== "DRAFT" && (
                    <p className="mt-1 text-sm text-ink-soft">
                      {event.seatsConfirmed} confirmed · {event.seatsHeld} held
                      · {event.seatsLeft} of {event.seatLimit} left
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {event.status !== "DRAFT" && (
                    <Link
                      href={`/my-events/${event.id}`}
                      className={buttonClass({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      Bookings
                      <span className="sr-only"> for {event.title}</span>
                    </Link>
                  )}
                  {/* Each link says which event it's for: a screen reader's
                      list of links would otherwise be "Edit, Edit, Edit" */}
                  <Link
                    href={`/events/${event.id}/edit`}
                    className={buttonClass({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    Edit<span className="sr-only"> {event.title}</span>
                  </Link>
                  {event.status === "PUBLISHED" && (
                    <Link
                      href={`/events/${event.id}`}
                      className={buttonClass({ variant: "ghost", size: "sm" })}
                    >
                      View<span className="sr-only"> {event.title}</span>
                    </Link>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <p className="mt-6 text-sm text-ink-muted">
          Showing your {limit} latest events.
        </p>
      )}
    </>
  );
}
