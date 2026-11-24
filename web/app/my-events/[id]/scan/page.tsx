import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TicketScanner } from "@/components/TicketScanner";
import { Spinner } from "@/components/ui/Spinner";
import { getCurrentUser } from "@/lib/auth";
import { getMyEvent } from "@/lib/server-api";
import { display, label } from "@/lib/ui";

export const metadata: Metadata = { title: "Check tickets | Tixbook" };

// The door scanner for one of my events (issue #67). The page only checks
// who may open it; the API checks again on every scan, because the
// browser can always be bypassed.
export default function ScanTicketsPage({
  params,
}: PageProps<"/my-events/[id]/scan">) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      {/* Reading the cookie must happen inside Suspense (Cache Components rule) */}
      <Suspense fallback={<Spinner label="Loading the scanner" />}>
        <Scanner params={params} />
      </Suspense>
    </div>
  );
}

async function Scanner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  if (user.role !== "ORGANISER") {
    return <p className="text-ink-soft">Only organisers can check tickets.</p>;
  }

  // null = doesn't exist OR belongs to another organiser (404 for both)
  const event = await getMyEvent(id);
  if (!event) notFound();

  return (
    <>
      <Link
        href={`/my-events/${event.id}`}
        className={`text-ink-muted hover:text-ink ${label}`}
      >
        <span aria-hidden="true">← </span>Bookings
      </Link>
      <h1 className={`mt-4 text-display-md text-ink ${display}`}>
        Check tickets
      </h1>
      <p className="mt-2 text-ink-soft">{event.title}</p>
      <TicketScanner eventId={event.id} timezone={event.timezone} />
    </>
  );
}
