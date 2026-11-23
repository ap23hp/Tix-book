"use client";

import { useEffect, useRef, useState } from "react";
import type { Booking } from "@/lib/types";

// After Stripe sends the user back, the webhook may not have arrived yet
// (it usually has: Stripe waits up to 10 s for it before redirecting).
// Ask the API every 2 s, up to 20 times (~40 s), then say it's slow.
export const POLL_MS = 2_000;
export const MAX_POLLS = 20;

export type ConfirmationState = "waiting" | "slow";

// Asks GET /api/v1/bookings/:id until the webhook has decided: the booking
// is no longer HELD (or EXPIRED, which can still turn into a late CONFIRMED
// or REFUNDED, decision 041). Then calls onSettled with the new booking.
//
// - One request at a time: the next one is scheduled after the last answer,
//   so a slow API never gets a pile of overlapping requests.
// - The cleanup cancels the timer and the request in flight, so nothing
//   runs after the page is left or hidden (<Activity> runs cleanups too).
export function usePaymentConfirmation(
  bookingId: string,
  active: boolean,
  onSettled: (booking: Booking) => void,
): ConfirmationState {
  const [state, setState] = useState<ConfirmationState>("waiting");
  // Always call the latest onSettled without restarting the polling when
  // the parent passes a new function (avoids a stale closure)
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  });

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;

    async function check() {
      polls += 1;
      try {
        const res = await fetch(`/api/v1/bookings/${bookingId}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.ok) {
          const booking = (await res.json()) as Booking;
          if (booking.status !== "HELD" && booking.status !== "EXPIRED") {
            onSettledRef.current(booking);
            return;
          }
        }
      } catch {
        if (controller.signal.aborted) return; // we left: stop quietly
        // A network blip: just try again on the next tick
      }
      if (polls >= MAX_POLLS) {
        setState("slow");
        return;
      }
      timer = setTimeout(check, POLL_MS);
    }

    timer = setTimeout(check, POLL_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [bookingId, active]);

  return state;
}
