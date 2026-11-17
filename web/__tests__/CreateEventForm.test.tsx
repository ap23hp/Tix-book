import { fireEvent, render, screen } from "@testing-library/react";
import { CreateEventForm } from "@/components/CreateEventForm";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
}));

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as jest.Mock;
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillInPersonEvent() {
  type("Title", "Friday Night Comedy");
  type("Description", "Five comedians, one night.");
  type("Venue name", "The Lantern Rooms");
  type("Venue address", "1 High Street, London");
  type("Starts", "2027-01-08T20:00");
  type("Ends", "2027-01-08T22:00");
  type(/^Price/, "12.50");
  type("Seats", "80");
}

// The JSON body the form sent to the API
function sentBody() {
  const [, options] = (global.fetch as jest.Mock).mock.calls[0];
  return JSON.parse(options.body);
}

beforeEach(() => jest.clearAllMocks());

describe("CreateEventForm", () => {
  it("sends price in pence, dates as ISO strings, and publishes", async () => {
    mockFetch(201, { id: "e1" });
    render(<CreateEventForm />);
    fillInPersonEvent();
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    await screen.findByRole("button", { name: "Creating event…" });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/events",
      expect.objectContaining({ method: "POST" }),
    );
    expect(sentBody()).toMatchObject({
      title: "Friday Night Comedy",
      category: "Comedy",
      format: "IN_PERSON",
      status: "PUBLISHED",
      pricePence: 1250,
      seatLimit: 80,
      venueName: "The Lantern Rooms",
    });
    expect(sentBody().startsAt).toBe(
      new Date("2027-01-08T20:00").toISOString(),
    );
    expect(sentBody().meetingLink).toBeUndefined();
  });

  it("swaps venue fields for a meeting link when Online is chosen", () => {
    render(<CreateEventForm />);
    expect(screen.queryByLabelText("Meeting link")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Online"));

    expect(screen.getByLabelText("Meeting link")).toBeInTheDocument();
    expect(screen.queryByLabelText("Venue name")).not.toBeInTheDocument();
  });

  it("shows the API's field errors next to the fields", async () => {
    mockFetch(400, {
      error: "Invalid event data",
      details: [
        { field: "endsAt", message: "End time must be after start time" },
      ],
    });
    render(<CreateEventForm />);
    fillInPersonEvent();
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please fix the highlighted fields.",
    );
    expect(screen.getByLabelText("Ends")).toHaveAccessibleDescription(
      "End time must be after start time",
    );
  });

  it("goes to the new event's page after it's created", async () => {
    mockFetch(201, { id: "e1" });
    render(<CreateEventForm />);
    fillInPersonEvent();
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    await screen.findByRole("button", { name: "Creating event…" });
    await new Promise((r) => setTimeout(r, 0));
    expect(push).toHaveBeenCalledWith("/events/e1");
  });
});