import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventDashboard } from "@/components/EventDashboard";
import { Spinner } from "@/components/ui/Spinner";
import { getCurrentUser } from "@/lib/auth";
import { getEventDashboard } from "@/lib/server-api";
import { display, label } from "@/lib/ui";

export const metadata: Metadata = { title: "Event bookings | Tixbook" };

// The organiser dashboard for one event: seats confirmed, on hold and left,
// revenue, and every booking (phase 5d)
export default function EventBookingsPage({
  params,
}: PageProps<"/my-events/[id]">) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <Link
        href="/my-events"
        className={`text-ink-muted hover:text-ink ${label}`}
      >
        <span aria-hidden="true">← </span>My events
      </Link>
      {/* Reading the cookie must happen inside Suspense (Cache Components rule) */}
      <Suspense
        fallback={<Spinner label="Loading the bookings" className="mt-8" />}
      >
        <Dashboard params={params} />
      </Suspense>
    </div>
  );
}

async function Dashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  if (user.role !== "ORGANISER") {
    return (
      <p className="mt-6 text-ink-soft">
        Only organisers can see an event&apos;s bookings.
      </p>
    );
  }

  // null = doesn't exist OR belongs to another organiser (404 for both)
  const dashboard = await getEventDashboard(id);
  if (!dashboard) notFound();

  return (
    <>
      <h1 className={`mt-4 text-display-md text-ink ${display}`}>
        {dashboard.event.title}
      </h1>
      <EventDashboard dashboard={dashboard} />
    </>
  );
}
