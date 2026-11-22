import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { BOOKING_STATUS } from "@/lib/booking-status";
import type { Booking } from "@/lib/types";
import { display } from "@/lib/ui";

// A booking plus the text the server formatted for it (dates are only ever
// formatted on the server, so the server's HTML and the browser agree)
export type TicketItem = {
  booking: Booking;
  dateLabel: string;
  totalLabel: string;
};

// The attendee's bookings, newest first. A plain (sync) component, so it can
// be unit tested; the page around it loads the data.
export function MyTicketsList({ items }: { items: TicketItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="mt-8 text-center">
        <p className="text-ink-soft">You haven&apos;t booked anything yet.</p>
        <Link href="/" className={buttonClass({ className: "mt-4" })}>
          Browse events
        </Link>
      </Card>
    );
  }

  return (
    <ul className="mt-8 flex flex-col gap-4">
      {items.map(({ booking, dateLabel, totalLabel }) => {
        const status = BOOKING_STATUS[booking.status];
        const inactive =
          booking.status === "EXPIRED" || booking.status === "CANCELLED";
        return (
          <li key={booking.id}>
            <Card
              as="article"
              className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${
                inactive ? "opacity-70" : ""
              }`}
            >
              <div>
                <Badge tone={status.tone}>{status.label}</Badge>
                <h2 className={`mt-2 text-display-sm text-ink ${display}`}>
                  {booking.event.title}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">{dateLabel}</p>
                <p className="text-sm text-ink-muted">
                  {booking.seats} {booking.seats === 1 ? "seat" : "seats"} ·{" "}
                  {totalLabel} ·{" "}
                  <span className="font-mono">{booking.reference}</span>
                </p>
              </div>
              {/* The link names the event, so a screen reader's list of
                  links isn't "View, View, View" */}
              <Link
                href={`/bookings/${booking.id}`}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                View
                <span className="sr-only">
                  {" "}
                  booking for {booking.event.title}
                </span>
              </Link>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
