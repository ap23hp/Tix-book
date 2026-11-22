"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { sendJson } from "@/lib/client-api";
import { formatPrice } from "@/lib/format";
import type { Booking } from "@/lib/types";

// The most seats one booking can hold (API decision 037)
const MAX_SEATS = 10;

type Props = {
  eventId: string;
  eventTitle: string;
  pricePence: number;
  seatsLeft: number;
};

// "Book" on the event page: a dialog to choose seats, then the booking page.
export function BookingPanel({
  eventId,
  eventTitle,
  pricePence,
  seatsLeft,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState(1);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // One key per dialog: made when it opens, sent with every try, so a double
  // click or a retry after a network error is ONE booking (decision 010)
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const soldOut = seatsLeft <= 0;
  const isFree = pricePence === 0;
  const maxSeats = Math.min(MAX_SEATS, Math.max(seatsLeft, 1));

  function openDialog() {
    setIdempotencyKey(crypto.randomUUID());
    setSeats(1);
    setMessage(null);
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);

    const result = await sendJson<Booking>(
      "POST",
      `/api/v1/events/${eventId}/bookings`,
      { seats, idempotencyKey },
    );

    if (result.ok) {
      // Close the dialog first: this page stays in the DOM, hidden, and
      // coming back to it shouldn't show the old dialog
      setOpen(false);
      setPending(false);
      router.push(`/bookings/${result.data.id}`);
      return;
    }

    setPending(false);
    if (result.status === 401) {
      router.push("/login");
      return;
    }
    if (result.status === 409) {
      // Someone else booked in the meantime: say so, and refresh the page so
      // "seats left" shows the new number
      setMessage(
        result.message === "Sold out"
          ? "Sorry, someone else just got the last seats."
          : `${result.message}. Choose fewer seats and try again.`,
      );
      router.refresh();
      return;
    }
    // Anything else (including a network error): the same key is kept, so
    // trying again can't create a second booking
    setMessage(result.message);
  }

  return (
    <>
      {/* Only the button changes when the event is sold out. The dialog
          always stays: after a 409 the page refreshes to 0 seats left, and
          removing the dialog then would hide the "someone else got the last
          seats" message the moment it appears. */}
      {soldOut ? (
        <Button disabled className="mt-5 w-full">
          Sold out
        </Button>
      ) : (
        <Button onClick={openDialog} className="mt-5 w-full">
          {isFree ? "Book free tickets" : "Book tickets"}
        </Button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Book tickets">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <p className="text-ink-soft">{eventTitle}</p>

          <Select
            label="Seats"
            value={String(seats)}
            onChange={(e) => setSeats(Number(e.target.value))}
            options={Array.from({ length: maxSeats }, (_, i) => ({
              value: String(i + 1),
              label: String(i + 1),
            }))}
          />

          <p className="text-sm text-ink-soft">
            Total:{" "}
            <strong className="text-ink">
              {formatPrice(pricePence * seats)}
            </strong>
            {isFree
              ? ". Free events are booked straight away."
              : ". Your seats are held for 5 minutes while you confirm."}
          </p>

          {message && (
            <p role="alert" className="text-sm text-accent">
              {message}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Booking…" : isFree ? "Book" : "Hold seats"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
