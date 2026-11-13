import Link from "next/link";
import { TornTicket } from "@/components/Illustrations";
import { display } from "@/lib/ui";

export default function EventNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-300 flex-col items-center px-6 py-16 text-center">
      <TornTicket />
      <h1 className={`mt-6 text-display-md text-ink ${display}`}>Event not found</h1>
      <p className="mt-2 max-w-sm text-ink-soft">
        This ticket doesn&apos;t match any event. It may have been removed, or the link may be wrong.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-accent px-7 py-3 font-semibold text-surface hover:bg-accent-hover"
      >
        <span aria-hidden="true">← </span>All events
      </Link>
    </div>
  );
}