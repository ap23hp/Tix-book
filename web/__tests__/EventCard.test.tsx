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
  seatLimit: 80,
  seatsLeft: 40,
};

describe("EventCard", () => {
  it("shows the title, venue and price", () => {
    render(<EventCard event={baseEvent} daysUntil={57} />);

    expect(
      screen.getByRole("heading", { name: "Friday Night Comedy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("In person · The Lantern Rooms"),
    ).toBeInTheDocument();
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
        event={{
          ...baseEvent,
          format: "ONLINE",
          venueName: null,
          pricePence: 0,
        }}
        daysUntil={1}
      />,
    );

    expect(screen.getAllByText("Online")).toHaveLength(2); // the pill + the details line
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });

  it("says nothing about seats while plenty are left", () => {
    render(<EventCard event={baseEvent} daysUntil={57} />);
    expect(screen.queryByText(/left|Sold out/)).not.toBeInTheDocument();
  });

  it("warns when only a few seats are left", () => {
    render(<EventCard event={{ ...baseEvent, seatsLeft: 5 }} daysUntil={57} />);
    expect(screen.getByText("Only 5 seats left")).toBeInTheDocument();
  });

  it("says 'seat' for the last one", () => {
    render(<EventCard event={{ ...baseEvent, seatsLeft: 1 }} daysUntil={57} />);
    expect(screen.getByText("Only 1 seat left")).toBeInTheDocument();
  });

  it("shows Sold out when no seats are left", () => {
    render(<EventCard event={{ ...baseEvent, seatsLeft: 0 }} daysUntil={57} />);
    expect(screen.getByText("Sold out")).toBeInTheDocument();
  });
});
