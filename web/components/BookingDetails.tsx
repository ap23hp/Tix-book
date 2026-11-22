"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { BOOKING_STATUS } from "@/lib/booking-status";
import { sendJson } from "@/lib/client-api";
import type { Booking, BookingStatus } from "@/lib/types";
import { display, label } from "@/lib/ui";

type Props = {
  booking: Booking;
  // Formatted on the server (dates and time zones are only formatted once,
  // so the server's HTML and the browser can't disagree)
  labels: { date: string; time: string; total: string };
};

export function BookingDetails({ booking, labels }: Props) {
  const router = useRouter();
  const toast = useToast();
  // What happened in this browser since the page loaded (confirmed, or the
  // countdown ran out). The server's status is the starting point.
  const [override, setOverride] = useState<BookingStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const status = override ?? booking.status;
  const { event } = booking;

  // Stable, so the countdown's effect doesn't restart on every render
  const handleExpire = useCallback(() => setOverride("EXPIRED"), []);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    const result = await sendJson<Booking>(
      "POST",
      `/api/v1/bookings/${booking.id}/confirm`,
      {},
    );
    setPending(false);
    if (result.ok) {
      setOverride("CONFIRMED");
      toast({ message: "Booking confirmed" });
      router.refresh(); // fetch the confirmed booking (e.g. the meeting link)
      return;
    }
    if (result.status === 409) {
      setOverride("EXPIRED");
      return;
    }
    setMessage(result.message);
  }

  const badge = BOOKING_STATUS[status];
  const venue =
    event.format === "ONLINE"
      ? "Online"
      : [event.venueName, event.venueAddress].filter(Boolean).join(", ");

  return (
    <Card as="article" className="mt-6">
      <Badge tone={badge.tone}>{badge.label}</Badge>
      <h2 className={`mt-3 text-display-sm text-ink ${display}`}>
        {event.title}
      </h2>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Detail term="Date">{labels.date}</Detail>
        <Detail term="Time">{labels.time}</Detail>
        <Detail term="Where">{venue}</Detail>
        <Detail term="Seats">
          {booking.seats} · {labels.total}
        </Detail>
        <Detail term="Reference">
          <span className="font-mono">{booking.reference}</span>
        </Detail>
      </dl>

      {status === "HELD" && booking.holdExpiresAt && (
        <div className="mt-6 border-t border-line pt-6">
          <p className="text-ink-soft">
            Your seats are held. Confirm before the time runs out, or they go
            back on sale.
          </p>
          <div className="mt-3">
            <Countdown
              expiresAt={booking.holdExpiresAt}
              serverTime={booking.serverTime}
              onExpire={handleExpire}
            />
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Payments arrive in a later version. In this demo, confirming books
            the seats without paying.
          </p>
          {message && (
            <p role="alert" className="mt-3 text-sm text-accent">
              {message}
            </p>
          )}
          <Button onClick={confirm} disabled={pending} className="mt-4 w-full">
            {pending ? "Confirming…" : "Confirm booking"}
          </Button>
        </div>
      )}

      {status === "CONFIRMED" && (
        <div className="mt-6 border-t border-line pt-6">
          <p className="font-semibold text-ink">You&apos;re going!</p>
          <p className="mt-1 text-ink-soft">
            Show the reference{" "}
            <span className="font-mono">{booking.reference}</span> at the door.
          </p>
          {event.meetingLink && (
            <p className="mt-3">
              <a
                href={event.meetingLink}
                className="font-semibold text-ink underline underline-offset-4"
              >
                Join the event online
              </a>
            </p>
          )}
        </div>
      )}

      {status === "EXPIRED" && (
        <div className="mt-6 border-t border-line pt-6">
          <p role="status" className="font-semibold text-ink">
            Your hold has expired and the seats were released.
          </p>
          <p className="mt-1 text-ink-soft">
            If there are seats left, you can book again.
          </p>
          <Link
            href={`/events/${event.id}`}
            className={buttonClass({ variant: "secondary", className: "mt-4" })}
          >
            Back to the event
          </Link>
        </div>
      )}
    </Card>
  );
}

function Detail({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className={`text-ink-muted ${label}`}>{term}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}
