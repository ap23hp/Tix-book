import Link from "next/link";
import { TornTicket } from "@/components/Illustrations";
import { buttonClass } from "@/components/ui/Button";
import { display } from "@/lib/ui";

// Shown for an unknown booking id AND for someone else's booking (the API
// answers 404 for both, so nobody can tell whether a booking exists)
export default function BookingNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-300 flex-col items-center px-6 py-16 text-center">
      <TornTicket />
      <h1 className={`mt-6 text-display-md text-ink ${display}`}>
        Booking not found
      </h1>
      <p className="mt-2 max-w-sm text-ink-soft">
        This booking doesn&apos;t exist, or it belongs to another account.
      </p>
      <Link href="/my-tickets" className={buttonClass({ className: "mt-6" })}>
        <span aria-hidden="true">← </span>My tickets
      </Link>
    </div>
  );
}
