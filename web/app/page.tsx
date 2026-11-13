import { EventCard, type EventSummary } from "@/components/EventCard";

const fakeEvents: EventSummary[] = [
  {
    id: "1",
    title: "Friday Night Comedy",
    category: "Comedy",
    format: "IN_PERSON",
    startsAt: "2027-01-08T20:00:00.000Z",
    timezone: "Europe/London",
    venueName: "The Lantern Rooms",
    pricePence: 1200,
  },
  {
    id: "2",
    title: "Small Business Marketing Webinar",
    category: "business",
    format: "ONLINE",
    startsAt: "2027-01-19T13:00:00.000Z",
    timezone: "Europe/London",
    venueName: null,
    pricePence: 0,
  },
  {
    id: "3",
    title: "Street Food Tasting",
    category: "Food",
    format: "IN_PERSON",
    startsAt: "2027-07-10T18:30:00.000Z",
    timezone: "Europe/London",
    venueName: "Market Hall",
    pricePence: 850,
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-300 p-6">
      <h1 className="font-display text-display-lg font-extrabold [font-variation-settings:'wdth'_75] tracking-tight text-ink">
        Upcoming events
      </h1>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {fakeEvents.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </main>
  );
}
