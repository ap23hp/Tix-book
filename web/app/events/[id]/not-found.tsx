import Link from "next/link";
import { TornTicket } from "@/components/Illustrations";
import { buttonClass } from "@/components/ui/Button";
import { display } from "@/lib/ui";

export default function EventNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-300 flex-col items-center px-6 py-16 text-center">
      <TornTicket />
      <h1 className={`mt-6 text-display-md text-ink ${display}`}>
        Event not found
      </h1>
      <p className="mt-2 max-w-sm text-ink-soft">
        This ticket doesn&apos;t match any event. It may have been removed, or
        the link may be wrong.
      </p>
      <Link href="/" className={buttonClass({ className: "mt-6" })}>
        <span aria-hidden="true">← </span>All events
      </Link>
    </div>
  );
}
