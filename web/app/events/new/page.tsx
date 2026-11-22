import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EventForm } from "@/components/EventForm";
import { getCurrentUser } from "@/lib/auth";
import { display } from "@/lib/ui";

export const metadata: Metadata = { title: "Create an event | Tixbook" };

export default function NewEventPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12">
      <h1 className={`text-display-md text-ink ${display}`}>Create an event</h1>
      {/* Reading the cookie must happen inside Suspense (Cache Components rule) */}
      <Suspense fallback={<p className="mt-6 text-ink-muted">Loading…</p>}>
        <OrganisersOnly />
      </Suspense>
    </div>
  );
}

async function OrganisersOnly() {
  const user = await getCurrentUser();

  // Not logged in → log in first
  if (!user) redirect("/login");

  // Logged in, but an attendee. The API would also refuse (403);
  // this just explains it instead of showing a form that can't work.
  if (user.role !== "ORGANISER") {
    return (
      <p className="mt-6 text-ink-soft">
        Only organisers can create events.{" "}
        <Link href="/" className="text-ink underline underline-offset-4">
          Browse events
        </Link>
      </p>
    );
  }

  return <EventForm />;
}