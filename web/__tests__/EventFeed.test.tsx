import { fireEvent, render, screen } from "@testing-library/react";
import { EventFeed } from "@/components/EventFeed";
import type { EventSummary } from "@/lib/types";

function makeEvent(id: string, title: string, startsAt: string): EventSummary {
  return {
    id,
    title,
    category: "Comedy",
    format: "IN_PERSON",
    startsAt,
    timezone: "Europe/London",
    venueName: "Hall",
    pricePence: 1000,
  };
}

const first = makeEvent("e1", "First show", "2027-01-08T20:00:00.000Z");
const second = makeEvent("e2", "Second show", "2027-02-10T20:00:00.000Z");

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as jest.Mock;
}

function renderFeed(cursor: string | null) {
  render(
    <EventFeed
      initialEvents={[first]}
      initialCursor={cursor}
      filters={{ q: "show" }}
      now="2026-11-17T12:00:00.000Z"
    />,
  );
}

describe("EventFeed", () => {
  it("has no Load more button on the last page", () => {
    renderFeed(null);

    expect(screen.getByText("First show")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("Load more sends the filters and cursor, and adds the next page below", async () => {
    mockFetch(200, { events: [second], nextCursor: null });
    renderFeed("cursor-1");

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Second show")).toBeInTheDocument();
    expect(screen.getByText("First show")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/events?q=show&cursor=cursor-1",
      expect.anything(),
    );
    // That was the last page
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows an error and a Try again button when loading fails", async () => {
    mockFetch(500, { error: "Something went wrong" });
    renderFeed("cursor-1");

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load more events",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
}); 