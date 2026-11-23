import { render, screen, within } from "@testing-library/react";
import { EventDashboard } from "@/components/EventDashboard";
import type { EventDashboard as Dashboard } from "@/lib/types";

function makeDashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    event: {
      id: "e1",
      title: "Jazz night",
      status: "PUBLISHED",
      startsAt: "2026-12-05T19:30:00.000Z",
      timezone: "Europe/London",
      seatLimit: 10,
      pricePence: 1500,
    },
    summary: {
      seatsConfirmed: 3,
      seatsHeld: 2,
      seatsLeft: 5,
      revenuePence: 4000,
    },
    bookings: [
      {
        id: "b2",
        reference: "TIX-HELD2222",
        status: "HELD",
        seats: 2,
        totalPence: 3000,
        createdAt: "2026-11-23T10:05:00.000Z",
        attendeeName: "Sam Patel",
      },
      {
        id: "b1",
        reference: "TIX-CONF1111",
        status: "CONFIRMED",
        seats: 3,
        totalPence: 4000,
        createdAt: "2026-11-23T09:00:00.000Z",
        attendeeName: "Alex Brown",
      },
    ],
    hasMore: false,
    ...overrides,
  };
}

// The value next to a term in the summary (<dt>term</dt><dd>value</dd>)
function stat(term: string) {
  return screen.getByText(term, { selector: "dt" }).nextElementSibling;
}

describe("EventDashboard", () => {
  it("shows confirmed, on hold, left and revenue", () => {
    render(<EventDashboard dashboard={makeDashboard()} />);
    expect(stat("Confirmed")).toHaveTextContent("3 of 10");
    expect(stat("On hold now")).toHaveTextContent("2");
    expect(stat("Seats left")).toHaveTextContent("5");
    expect(stat("Revenue")).toHaveTextContent("£40");
  });

  it("lists bookings in a table with the status as text", () => {
    render(<EventDashboard dashboard={makeDashboard()} />);
    const table = screen.getByRole("table", {
      name: "Bookings for Jazz night, newest first",
    });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 bookings
    expect(rows[1]).toHaveTextContent("TIX-HELD2222");
    expect(rows[1]).toHaveTextContent("Sam Patel");
    expect(rows[1]).toHaveTextContent("Held");
    expect(rows[1]).toHaveTextContent("£30");
    expect(rows[2]).toHaveTextContent("Confirmed");
    // Times in the event's time zone (London, GMT in November)
    expect(rows[2]).toHaveTextContent("23 Nov, 09:00");
    expect(
      within(table).getByRole("columnheader", { name: "Attendee" }),
    ).toBeInTheDocument();
  });

  it("can be scrolled with the keyboard on small screens", () => {
    render(<EventDashboard dashboard={makeDashboard()} />);
    expect(
      screen.getByRole("region", { name: "Bookings table" }),
    ).toHaveAttribute("tabindex", "0");
  });

  it("says when there are no bookings yet", () => {
    render(
      <EventDashboard
        dashboard={makeDashboard({
          bookings: [],
          summary: {
            seatsConfirmed: 0,
            seatsHeld: 0,
            seatsLeft: 10,
            revenuePence: 0,
          },
        })}
      />,
    );
    expect(screen.getByText("No bookings yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says when only the newest bookings are shown", () => {
    render(<EventDashboard dashboard={makeDashboard({ hasMore: true })} />);
    expect(
      screen.getByText("Showing the 2 newest bookings."),
    ).toBeInTheDocument();
  });
});
