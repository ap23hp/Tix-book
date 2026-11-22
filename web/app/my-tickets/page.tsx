import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MyTicketsList } from "@/components/MyTicketsList";
import { Spinner } from "@/components/ui/Spinner";
import { getCurrentUser } from "@/lib/auth";
import { formatInZone, formatPrice } from "@/lib/format";
import { getMyBookings } from "@/lib/server-api";
import { display } from "@/lib/ui";

export const metadata: Metadata = { title: "My tickets | Tixbook" };

export default function MyTicketsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className={`text-display-md text-ink ${display}`}>My tickets</h1>
      {/* Reading the cookie must happen inside Suspense (Cache Components rule) */}
      <Suspense
        fallback={<Spinner label="Loading your tickets" className="mt-8" />}
      >
        <MyTickets />
      </Suspense>
    </div>
  );
}

async function MyTickets() {
  const user = await getCurrentUser();
  // Not logged in → log in first. redirect() stops rendering here.
  if (!user) redirect("/login");

  const { bookings } = await getMyBookings();

  // Formatted here, on the server only, in each event's own time zone
  const items = bookings.map((booking) => ({
    booking,
    dateLabel: formatInZone(booking.event.startsAt, booking.event.timezone, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }),
    totalLabel: formatPrice(booking.totalPence),
  }));

  return <MyTicketsList items={items} />;
}
