import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { BOOKING_STATUS } from "@/lib/booking-status";
import { formatInZone, formatPrice } from "@/lib/format";
import type { EventDashboard as Dashboard } from "@/lib/types";
import { display, label } from "@/lib/ui";

type Props = { dashboard: Dashboard };

// One event's bookings, for its organiser. A plain (sync) component, so it
// can be unit tested; the page around it loads the data. Rendered on the
// server only, so dates are formatted once (in the event's time zone).
export function EventDashboard({ dashboard }: Props) {
  const { event, summary, bookings, hasMore } = dashboard;
  const when = (iso: string, options: Intl.DateTimeFormatOptions) =>
    formatInZone(iso, event.timezone, options);

  return (
    <>
      <p className="mt-2 text-ink-soft">
        {when(event.startsAt, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        })}
      </p>

      {/* Confirmed + on hold + left = the seat limit (one rule for all) */}
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat term="Confirmed">
          {summary.seatsConfirmed}
          <span className="text-base text-ink-muted">
            {" "}
            of {event.seatLimit}
          </span>
        </Stat>
        <Stat term="On hold now" note="Back on sale if not paid in time">
          {summary.seatsHeld}
        </Stat>
        <Stat term="Seats left">{summary.seatsLeft}</Stat>
        <Stat term="Revenue" note="Confirmed bookings only">
          {formatPrice(summary.revenuePence)}
        </Stat>
      </dl>

      <h2 className={`mt-10 text-display-sm text-ink ${display}`}>Bookings</h2>
      {bookings.length === 0 ? (
        <p className="mt-3 text-ink-soft">No bookings yet.</p>
      ) : (
        // Wide tables scroll inside this box on small screens; it can take
        // keyboard focus, so it can be scrolled without a mouse (WCAG 2.1.1;
        // axe's "scrollable-region-focusable" rule asks for exactly this)
        <div
          className="mt-4 overflow-x-auto rounded-lg border border-line"
          // A focusable scroll box is intentional here, see above
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          role="region"
          aria-label="Bookings table"
        >
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">
              Bookings for {event.title}, newest first
            </caption>
            <thead className="bg-page text-ink-muted">
              <tr>
                <Th>Reference</Th>
                <Th>Attendee</Th>
                <Th align="right">Seats</Th>
                <Th align="right">Total</Th>
                <Th>Status</Th>
                <Th>Booked</Th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => {
                const status = BOOKING_STATUS[booking.status];
                return (
                  <tr key={booking.id} className="border-t border-line">
                    <td className="px-3 py-2 font-mono">{booking.reference}</td>
                    <td className="px-3 py-2 text-ink">
                      {booking.attendeeName}
                    </td>
                    <td className="px-3 py-2 text-right">{booking.seats}</td>
                    <td className="px-3 py-2 text-right">
                      {formatPrice(booking.totalPence)}
                    </td>
                    <td className="px-3 py-2">
                      {/* The badge's text says the status: not colour only */}
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {when(booking.createdAt, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && (
        <p className="mt-3 text-sm text-ink-muted">
          Showing the {bookings.length} newest bookings.
        </p>
      )}
    </>
  );
}

function Stat({
  term,
  note,
  children,
}: {
  term: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <dt className={`text-ink-muted ${label}`}>{term}</dt>
      <dd className={`mt-1 text-display-sm text-ink ${display}`}>{children}</dd>
      {note && <dd className="mt-1 text-xs text-ink-muted">{note}</dd>}
    </Card>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 font-semibold ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}
