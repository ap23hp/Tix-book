import { render, screen } from "@testing-library/react";
import { MyTicketsList, type TicketItem } from "@/components/MyTicketsList";
import type { Booking } from "@/lib/types";

function item(overrides: Partial<Booking>): TicketItem {
  const booking: Booking = {
    id: "b1",
    reference: "TIX-7KQ2M9XA",
    status: "CONFIRMED",
    seats: 2,
    unitPricePence: 1200,
    totalPence: 2400,
    holdExpiresAt: null,
    createdAt: "2026-11-22T12:00:00.000Z",
    serverTime: "2026-11-22T12:00:00.000Z",
    event: {
      id: "e1",
      title: "Jazz night",
      startsAt: "2026-12-05T19:30:00.000Z",
      endsAt: "2026-12-05T22:00:00.000Z",
      timezone: "Europe/London",
      format: "IN_PERSON",
      venueName: "Hall",
      venueAddress: "1 Street",
      meetingLink: null,
    },
    ...overrides,
  };
  return {
    booking,
    dateLabel: "Sat, 5 Dec 2026, 19:30 GMT",
    totalLabel: "£24",
  };
}

describe("MyTicketsList", () => {
  it("shows each booking with its status, seats, total and reference", () => {
    render(
      <MyTicketsList
        items={[
          item({ id: "b1", status: "CONFIRMED" }),
          item({
            id: "b2",
            status: "HELD",
            seats: 1,
            reference: "TIX-HELD0001",
          }),
          item({ id: "b3", status: "EXPIRED" }),
        ]}
      />,
    );

    const tickets = screen.getAllByRole("article");
    expect(tickets).toHaveLength(3);
    expect(tickets[0]).toHaveTextContent("Confirmed");
    expect(tickets[0]).toHaveTextContent("2 seats · £24 · TIX-7KQ2M9XA");
    expect(tickets[1]).toHaveTextContent("Held");
    expect(tickets[1]).toHaveTextContent("1 seat");
    expect(tickets[2]).toHaveTextContent("Expired");
  });

  it("links to each booking, naming the event for screen readers", () => {
    render(<MyTicketsList items={[item({ id: "b9" })]} />);
    expect(
      screen.getByRole("link", { name: "View booking for Jazz night" }),
    ).toHaveAttribute("href", "/bookings/b9");
  });

  it("suggests browsing events when there are no bookings", () => {
    render(<MyTicketsList items={[]} />);
    expect(
      screen.getByText("You haven't booked anything yet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse events" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
