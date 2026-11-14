import { render, screen } from "@testing-library/react";
import { EventCard } from "@/components/EventCard";
import type { EventSummary } from "@/lib/types";

// One fake event; each test changes only what it needs
const baseEvent: EventSummary = {
  id: "e1",
  title: "Friday Night Comedy",
  category: "Comedy",
  format: "IN_PERSON",
  startsAt: "2027-01-08T20:00:00.000Z",
  timezone: "Europe/London",
  venueName: "The Lantern Rooms",
  pricePence: 1200,
};

describe("EventCard", () => {
  it("shows the title, venue and price", () => {
    render(<EventCard event={baseEvent} daysUntil={57} />);

    expect(screen.getByRole("heading", { name: "Friday Night Comedy" })).toBeInTheDocument();
    expect(screen.getByText("In person · The Lantern Rooms")).toBeInTheDocument();
    expect(screen.getByText("£12")).toBeInTheDocument();
    expect(screen.getByText("In 57 days")).toBeInTheDocument();
  });

  it("links to the event's detail page", () => {
    render(<EventCard event={baseEvent} daysUntil={57} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/events/e1");
  });

  it("shows the Online pill and Free for a free online event", () => {
    render(
      <EventCard
        event={{ ...baseEvent, format: "ONLINE", venueName: null, pricePence: 0 }}
        daysUntil={1}
      />,
    );

    expect(screen.getAllByText("Online")).toHaveLength(2); // the pill + the details line
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });
});