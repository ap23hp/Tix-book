"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { BOOKING_STATUS } from "@/lib/booking-status";
import { postJson } from "@/lib/client-api";
import { goToExternal } from "@/lib/navigate";
import type { Booking, BookingStatus } from "@/lib/types";
import { display, label } from "@/lib/ui";
import { usePaymentConfirmation } from "@/lib/use-payment-confirmation";

// What Stripe added to the URL when it sent the user back (?payment=...)
export type PaymentReturn = "success" | "cancelled" | null;

type Props = {
  booking: Booking;
  // Formatted on the server (dates and time zones are only formatted once,
  // so the server's HTML and the browser can't disagree)
  labels: { date: string; time: string; total: string };
  payment?: PaymentReturn;
  // The ticket's QR code (an SVG data URL made on the server), when confirmed
  ticketQr?: string | null;
};

export function BookingDetails({
  booking,
  labels,
  payment = null,
  ticketQr = null,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  // What happened in this browser since the page loaded (the payment was
  // confirmed, or the countdown ran out). The server's status is the start.
  const [override, setOverride] = useState<BookingStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [qrFullScreen, setQrFullScreen] = useState(false);
  const status = override ?? booking.status;
  const { event } = booking;

  // Back from Stripe with ?payment=success, but the webhook hasn't changed
  // the booking yet. The URL proves nothing (anyone can type it), so we
  // say "confirming" and wait for the API, never "confirmed".
  const confirming =
    payment === "success" && (status === "HELD" || status === "EXPIRED");

  const handleSettled = useCallback(
    (settled: Booking) => {
      setOverride(settled.status);
      if (settled.status === "CONFIRMED") {
        toast({ message: "Payment confirmed" });
      }
      router.refresh(); // fetch the confirmed booking (e.g. the meeting link)
    },
    [router, toast],
  );
  const confirmation = usePaymentConfirmation(
    booking.id,
    confirming,
    handleSettled,
  );

  // Stable, so the countdown's effect doesn't restart on every render
  const handleExpire = useCallback(() => setOverride("EXPIRED"), []);

  async function pay() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    const result = await postJson<{ url: string }>(
      `/api/v1/bookings/${booking.id}/checkout`,
      {},
    );
    if (result.ok) {
      // Leave for Stripe's page. Keep the button disabled until we're gone.
      goToExternal(result.data.url);
      return;
    }
    setPending(false);
    if (result.status === 409) {
      // The hold ran out, or it's already paid: show the server's answer
      setMessage(result.message);
      router.refresh();
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

      {confirming && (
        <div className="mt-6 border-t border-line pt-6">
          {confirmation === "waiting" ? (
            <div className="flex items-center gap-3">
              <Spinner label="Confirming your booking" size="sm" />
              <p className="font-semibold text-ink">
                Payment received. Confirming your booking…
              </p>
            </div>
          ) : (
            <>
              <p role="status" className="font-semibold text-ink">
                This is taking longer than usual.
              </p>
              <p className="mt-1 text-ink-soft">
                If your payment went through, your booking will be confirmed in
                a moment. Refresh this page, or check{" "}
                <Link
                  href="/my-tickets"
                  className="underline underline-offset-4"
                >
                  My tickets
                </Link>
                .
              </p>
            </>
          )}
        </div>
      )}

      {!confirming && status === "HELD" && booking.holdExpiresAt && (
        <div className="mt-6 border-t border-line pt-6">
          {payment === "cancelled" && (
            <p role="status" className="mb-3 font-semibold text-ink">
              Payment cancelled. Your seats are still held until the timer runs
              out.
            </p>
          )}
          <p className="text-ink-soft">
            Your seats are held. Pay before the time runs out, or they go back
            on sale.
          </p>
          <div className="mt-3">
            <Countdown
              expiresAt={booking.holdExpiresAt}
              serverTime={booking.serverTime}
              onExpire={handleExpire}
            />
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Payments use Stripe&apos;s test mode: no real money. Pay with the
            test card 4242 4242 4242 4242, any future date and any CVC.
          </p>
          {message && (
            <p role="alert" className="mt-3 text-sm text-accent">
              {message}
            </p>
          )}
          <Button onClick={pay} disabled={pending} className="mt-4 w-full">
            {pending ? "Opening Stripe…" : `Pay ${labels.total} with Stripe`}
          </Button>
        </div>
      )}

      {status === "CONFIRMED" && (
        <div className="mt-6 border-t border-line pt-6">
          <p className="font-semibold text-ink">You&apos;re going!</p>
          <p className="mt-1 text-ink-soft">
            Show this QR code or the reference{" "}
            <span className="font-mono">{booking.reference}</span> at the door.
          </p>
          {ticketQr && (
            <>
              <TicketQr
                src={ticketQr}
                reference={booking.reference}
                className="mx-auto mt-4 max-w-sm"
              />
              <div className="mt-4 text-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setQrFullScreen(true)}
                >
                  Show full screen
                </Button>
              </div>
              <Modal
                open={qrFullScreen}
                onClose={() => setQrFullScreen(false)}
                title="Your ticket"
                fullScreen
              >
                <p className="text-ink-soft">
                  Reference{" "}
                  <span className="font-mono text-ink">
                    {booking.reference}
                  </span>
                </p>
                {/* Only while open: one ticket image for screen readers */}
                {qrFullScreen && (
                  // As wide as the screen, but never taller than what's left
                  // under the title, so it's never cut off on a short screen
                  <TicketQr
                    src={ticketQr}
                    reference={booking.reference}
                    className="mx-auto mt-3 max-w-[calc(100dvh-9rem)]"
                  />
                )}
              </Modal>
            </>
          )}
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

      {status === "REFUNDED" && (
        <div className="mt-6 border-t border-line pt-6">
          <p role="status" className="font-semibold text-ink">
            Your payment was refunded in full.
          </p>
          <p className="mt-1 text-ink-soft">
            It arrived after your hold ended, and the seats had already gone to
            someone else. Refunds usually take 5 to 10 working days to show on
            your statement.
          </p>
          <Link
            href={`/events/${event.id}`}
            className={buttonClass({ variant: "secondary", className: "mt-4" })}
          >
            Back to the event
          </Link>
        </div>
      )}

      {!confirming && status === "EXPIRED" && (
        <div className="mt-6 border-t border-line pt-6">
          <p role="status" className="font-semibold text-ink">
            Your hold has expired and the seats were released.
          </p>
          <p className="mt-1 text-ink-soft">
            If there are seats left, you can book again.
          </p>
          {message && (
            <p role="alert" className="mt-3 text-sm text-accent">
              {message}
            </p>
          )}
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

// The QR code fills the width it's given. A data URL made on the server, so
// next/image has nothing to optimise. The white quiet zone is inside the
// image (lib/ticket-qr.ts), so it's there at every size.
function TicketQr({
  src,
  reference,
  className,
}: {
  src: string;
  reference: string;
  className: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Ticket QR code for booking ${reference}`}
      // The size before CSS applies (no layout jump); CSS makes it fluid
      width={384}
      height={384}
      className={`block aspect-square w-full rounded-md bg-white ${className}`}
    />
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
