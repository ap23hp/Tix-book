"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  expiresAt: string;
  // The server's clock when the booking was loaded (decision 008)
  serverTime: string;
  onExpire: () => void;
};

// "4:59" → "0:00". Counts from the SERVER's time, so a wrong clock on the
// user's computer doesn't matter: only how much time has passed here since
// the page loaded is measured locally.
export function Countdown({ expiresAt, serverTime, onExpire }: Props) {
  const expiresMs = Date.parse(expiresAt);
  const serverMs = Date.parse(serverTime);

  // First value comes from the props only, so the server's HTML and the
  // browser's first render match (no hydration mismatch)
  const [left, setLeft] = useState(() => Math.max(0, expiresMs - serverMs));

  // When this server time arrived in the browser. A ref survives the page
  // being hidden and shown again (<Activity>), so the countdown doesn't
  // restart from 5:00; a new serverTime (after a refresh) starts afresh.
  const loaded = useRef<{ serverMs: number; at: number } | null>(null);

  useEffect(() => {
    if (loaded.current?.serverMs !== serverMs) {
      loaded.current = { serverMs, at: Date.now() };
    }
    const start = loaded.current;

    function tick() {
      const serverNow = start.serverMs + (Date.now() - start.at);
      const remaining = Math.max(0, expiresMs - serverNow);
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        onExpire();
      }
    }

    tick();
    const timer = setInterval(tick, 1000);
    // Effect cleanup: stop the timer when the page is left or hidden
    return () => clearInterval(timer);
  }, [expiresMs, serverMs, onExpire]);

  const totalSeconds = Math.ceil(left / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  // Screen readers: role="timer" is not read out every second (that would
  // be unbearable). A polite status says it once when under a minute is left.
  const warning =
    left > 0 && left <= 60_000 ? "Less than a minute left to confirm." : "";

  return (
    <>
      <p
        role="timer"
        aria-label={`Time left to confirm: ${minutes} minutes ${seconds} seconds`}
        className="font-mono text-display-md tabular-nums text-ink"
      >
        {minutes}:{seconds}
      </p>
      <p role="status" className="sr-only">
        {warning}
      </p>
    </>
  );
}
