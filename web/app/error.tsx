"use client"; // error pages must be Client Components: the Retry button needs onClick

import { SleepingTicket } from "@/components/Illustrations";
import { display } from "@/lib/ui";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-300 flex-col items-center px-6 py-16 text-center">
      <SleepingTicket />
      <h1 className={`mt-6 text-display-md text-ink ${display}`}>Couldn&apos;t load events</h1>
      <p className="mt-2 max-w-sm text-ink-soft">
        The server may be waking up — this can take up to a minute.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 rounded-full bg-accent px-7 py-3 font-semibold text-surface hover:bg-accent-hover"
      >
        Retry
      </button>
    </div>
  );
}