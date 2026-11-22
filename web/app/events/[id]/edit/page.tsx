import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventForm } from "@/components/EventForm";
import { Spinner } from "@/components/ui/Spinner";
import { getCurrentUser } from "@/lib/auth";
import { getMyEvent } from "@/lib/server-api";
import { display, label } from "@/lib/ui";

export const metadata: Metadata = { title: "Edit event | Tixbook" };

export default function EditEventPage({
  params,
}: PageProps<"/events/[id]/edit">) {
  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12">
      <Link
        href="/my-events"
        className={`text-ink-muted hover:text-ink ${label}`}
      >
        <span aria-hidden="true">← </span>My events
      </Link>
      <h1 className={`mt-4 text-display-md text-ink ${display}`}>Edit event</h1>
      {/* Reading the cookie must happen inside Suspense (Cache Components rule) */}
      <Suspense
        fallback={<Spinner label="Loading the event" className="mt-8" />}
      >
        <EditEvent params={params} />
      </Suspense>
    </div>
  );
}

async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  if (user.role !== "ORGANISER") {
    return (
      <p className="mt-6 text-ink-soft">Only organisers can edit events.</p>
    );
  }

  // null = doesn't exist OR belongs to another organiser (the API answers
  // 404 for both), so show the same "Event not found" page either way
  const event = await getMyEvent(id);
  if (!event) notFound();

  return <EventForm event={event} />;
}
