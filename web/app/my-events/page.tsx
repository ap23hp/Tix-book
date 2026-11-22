import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MyEventsList } from "@/components/MyEventsList";
import { buttonClass } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { getCurrentUser } from "@/lib/auth";
import { getMyEvents, MY_EVENTS_LIMIT } from "@/lib/server-api";
import { display } from "@/lib/ui";

export const metadata: Metadata = { title: "My events | Tixbook" };

export default function MyEventsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className={`text-display-md text-ink ${display}`}>My events</h1>
        <Link
          href="/events/new"
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          Create event
        </Link>
      </div>
      {/* Reading the cookie must happen inside Suspense (Cache Components rule) */}
      <Suspense
        fallback={<Spinner label="Loading your events" className="mt-8" />}
      >
        <MyEvents />
      </Suspense>
    </div>
  );
}

async function MyEvents() {
  const user = await getCurrentUser();

  // Not logged in → log in first. redirect() stops rendering here.
  if (!user) redirect("/login");

  // The API would refuse an attendee (403); explain it instead
  if (user.role !== "ORGANISER") {
    return (
      <p className="mt-6 text-ink-soft">
        Only organisers have events.{" "}
        <Link href="/" className="text-ink underline underline-offset-4">
          Browse events
        </Link>
      </p>
    );
  }

  const page = await getMyEvents();
  return (
    <MyEventsList
      events={page.events}
      hasMore={page.nextCursor !== null}
      limit={MY_EVENTS_LIMIT}
    />
  );
}
