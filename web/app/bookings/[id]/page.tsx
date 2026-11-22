import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookingDetails } from "@/components/BookingDetails";
import { Spinner } from "@/components/ui/Spinner";
import { getCurrentUser } from "@/lib/auth";
import { formatInZone, formatPrice, formatTimeRange } from "@/lib/format";
import { getBooking } from "@/lib/server-api";
import { display } from "@/lib/ui";

export const metadata: Metadata = { title: "Your booking | Tixbook" };

export default function BookingPage({ params }: PageProps<"/bookings/[id]">) {
  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12">
      <h1 className={`text-display-md text-ink ${display}`}>Your booking</h1>
      {/* Reading the cookie must happen inside Suspense (Cache Components rule) */}
      <Suspense
        fallback={<Spinner label="Loading your booking" className="mt-8" />}
      >
        <BookingContent params={params} />
      </Suspense>
    </div>
  );
}

async function BookingContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // null = doesn't exist OR isn't mine (the API answers 404 for both)
  const booking = await getBooking(id);
  if (!booking) notFound();

  // Dates are formatted here, on the server only, in the event's time zone
  const { event } = booking;
  const labels = {
    date: formatInZone(event.startsAt, event.timezone, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    time: formatTimeRange(event.startsAt, event.endsAt, event.timezone),
    total: formatPrice(booking.totalPence),
  };

  return <BookingDetails booking={booking} labels={labels} />;
}
