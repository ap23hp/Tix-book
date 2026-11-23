import { render, screen } from "@testing-library/react";
import { MyEventsList } from "@/components/MyEventsList";
import type { MyEventListItem } from "@/lib/types";

function makeEvent(overrides: Partial<MyEventListItem>): MyEventListItem {
  return {
    id: "e1",
    title: "Jazz night",
    description: "Live jazz",
    category: "Music",
    format: "IN_PERSON",
    status: "PUBLISHED",
    startsAt: "2026-12-05T19:30:00.000Z",
    endsAt: "2026-12-05T22:00:00.000Z",
    doorsAt: null,
    timezone: "Europe/London",
    venueName: "Hall",
    venueAddress: "1 Street",
    meetingLink: null,
    pricePence: 1200,
    seatLimit: 50,
    seatsConfirmed: 12,
    seatsHeld: 3,
    seatsLeft: 35,
    ...overrides,
  };
}

describe("MyEventsList", () => {
  it("shows each event with its status", () => {
    render(
      <MyEventsList
        events={[
          makeEvent({ id: "e1", title: "Jazz night", status: "PUBLISHED" }),
          makeEvent({ id: "e2", title: "Comedy draft", status: "DRAFT" }),
        ]}
        hasMore={false}
        limit={50}
      />,
    );

    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(2);
    expect(articles[0]).toHaveTextContent("Published");
    expect(articles[0]).toHaveTextContent("Jazz night");
    expect(articles[1]).toHaveTextContent("Draft");
  });

  it("shows the date in the event's own time zone", () => {
    render(
      <MyEventsList
        events={[makeEvent({ startsAt: "2026-12-05T19:30:00.000Z" })]}
        hasMore={false}
        limit={50}
      />,
    );
    // December in London is GMT, so 19:30 UTC is 19:30 GMT
    expect(screen.getByRole("article")).toHaveTextContent(/19:30 GMT/);
  });

  it("links to the edit page, with the event's name for screen readers", () => {
    render(
      <MyEventsList events={[makeEvent({})]} hasMore={false} limit={50} />,
    );
    expect(
      screen.getByRole("link", { name: "Edit Jazz night" }),
    ).toHaveAttribute("href", "/events/e1/edit");
  });

  it("offers View only for published events", () => {
    render(
      <MyEventsList
        events={[
          makeEvent({ id: "e1", title: "Jazz night", status: "PUBLISHED" }),
          makeEvent({ id: "e2", title: "Comedy draft", status: "DRAFT" }),
        ]}
        hasMore={false}
        limit={50}
      />,
    );
    expect(
      screen.getByRole("link", { name: "View Jazz night" }),
    ).toHaveAttribute("href", "/events/e1");
    expect(
      screen.queryByRole("link", { name: "View Comedy draft" }),
    ).not.toBeInTheDocument();
  });

  it("shows a way to create the first event when there are none", () => {
    render(<MyEventsList events={[]} hasMore={false} limit={50} />);
    expect(
      screen.getByRole("link", { name: "Create your first event" }),
    ).toHaveAttribute("href", "/events/new");
  });

  it("says when only part of the list is shown", () => {
    render(<MyEventsList events={[makeEvent({})]} hasMore limit={50} />);
    expect(
      screen.getByText("Showing your 50 latest events."),
    ).toBeInTheDocument();
  });

  it("shows seat numbers and a Bookings link for a published event", () => {
    render(
      <MyEventsList events={[makeEvent({})]} hasMore={false} limit={50} />,
    );
    expect(
      screen.getByText("12 confirmed · 3 held · 35 of 50 left"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Bookings for Jazz night" }),
    ).toHaveAttribute("href", "/my-events/e1");
  });

  it("shows no numbers or Bookings link for a draft", () => {
    render(
      <MyEventsList
        events={[makeEvent({ status: "DRAFT" })]}
        hasMore={false}
        limit={50}
      />,
    );
    expect(screen.queryByText(/confirmed ·/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Bookings/ }),
    ).not.toBeInTheDocument();
  });
});
