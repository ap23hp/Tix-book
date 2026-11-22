import { fireEvent, render, screen } from "@testing-library/react";
import { EventForm } from "@/components/EventForm";
import { ToastProvider } from "@/components/ui/Toast";
import type { MyEvent } from "@/lib/types";

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

// Like the real app: the form sits inside the layout's ToastProvider
function renderForm(event?: MyEvent) {
  return render(
    <ToastProvider>
      <EventForm event={event} />
    </ToastProvider>,
  );
}

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

describe("EventForm (create)", () => {
  it("sends price in pence, dates as ISO strings, and publishes", async () => {
    mockFetch(201, { id: "e1" });
    renderForm();
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
    renderForm();
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
    renderForm();
    fillInPersonEvent();
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    // Find it by its text: the toast's role="alert" region is always in the
    // page (empty), so "the first alert" isn't necessarily this message
    expect(
      await screen.findByText("Please fix the highlighted fields."),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Ends")).toHaveAccessibleDescription(
      "End time must be after start time",
    );
  });

  it("goes to the new event's page after it's created", async () => {
    mockFetch(201, { id: "e1" });
    renderForm();
    fillInPersonEvent();
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    await screen.findByRole("button", { name: "Creating event…" });
    await new Promise((r) => setTimeout(r, 0));
    expect(push).toHaveBeenCalledWith("/events/e1");
  });
});

// An in-person event, as GET /api/v1/events/mine/:id returns it.
// jest.config.ts pins tests to London time.
const savedEvent: MyEvent = {
  id: "e1",
  title: "Jazz night",
  description: "Live jazz",
  category: "Music",
  format: "IN_PERSON",
  status: "PUBLISHED",
  startsAt: "2026-07-01T18:30:00.000Z", // 19:30 BST
  endsAt: "2026-07-01T21:00:00.000Z",
  doorsAt: null,
  timezone: "Europe/London",
  venueName: "The Hall",
  venueAddress: "1 High Street",
  meetingLink: null,
  pricePence: 1250,
  seatLimit: 80,
};

describe("EventForm (edit)", () => {
  it("starts filled in with the saved event, times in the browser's zone", () => {
    renderForm(savedEvent);

    expect(screen.getByLabelText("Title")).toHaveValue("Jazz night");
    expect(screen.getByLabelText("Category")).toHaveValue("Music");
    expect(screen.getByLabelText("Status")).toHaveValue("PUBLISHED");
    expect(screen.getByLabelText("Venue name")).toHaveValue("The Hall");
    // 18:30 UTC in July = 19:30 in London (BST)
    expect(screen.getByLabelText("Starts")).toHaveValue("2026-07-01T19:30");
    expect(screen.getByLabelText(/^Price/)).toHaveValue(12.5);
    expect(screen.getByLabelText("Seats")).toHaveValue(80);
  });

  it("sends a PATCH with the changes, keeping the original time zone", async () => {
    mockFetch(200, { ...savedEvent, title: "Jazz night (late show)" });
    renderForm(savedEvent);
    type("Title", "Jazz night (late show)");
    type("Status", "DRAFT");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByRole("button", { name: "Saving…" });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/events/e1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(sentBody()).toMatchObject({
      title: "Jazz night (late show)",
      status: "DRAFT",
      pricePence: 1250,
      // unchanged times go back exactly as they were saved
      startsAt: "2026-07-01T18:30:00.000Z",
    });
    expect(sentBody()).not.toHaveProperty("timezone");
  });

  it("clears the venue (null) when the event switches to online", async () => {
    mockFetch(200, savedEvent);
    renderForm(savedEvent);
    fireEvent.click(screen.getByLabelText("Online"));
    type("Meeting link", "https://example.com/meet");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByRole("button", { name: "Saving…" });
    expect(sentBody()).toMatchObject({
      format: "ONLINE",
      meetingLink: "https://example.com/meet",
      venueName: null,
      venueAddress: null,
    });
  });

  it("shows a toast and goes back to My events after saving", async () => {
    mockFetch(200, savedEvent);
    renderForm(savedEvent);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Event updated",
    );
    expect(push).toHaveBeenCalledWith("/my-events");
    expect(refresh).toHaveBeenCalled();
  });

  it("Cancel leaves straight away when nothing changed", () => {
    renderForm(savedEvent);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(push).toHaveBeenCalledWith("/my-events");
    expect(document.querySelector("dialog")?.open).toBe(false);
  });

  it("Cancel asks first when there are unsaved changes", () => {
    renderForm(savedEvent);
    type("Title", "Something else");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // The dialog opens and nothing has happened yet
    expect(document.querySelector("dialog")?.open).toBe(true);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Discard changes?");
    expect(push).not.toHaveBeenCalled();

    // "Keep editing" closes it and keeps the typed title
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(document.querySelector("dialog")?.open).toBe(false);
    expect(screen.getByLabelText("Title")).toHaveValue("Something else");

    // Asking again and discarding leaves the page
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(push).toHaveBeenCalledWith("/my-events");
  });

  it("shows the API's message when the save fails", async () => {
    mockFetch(400, {
      error: "Invalid event data",
      details: [
        { field: "endsAt", message: "End time must be after start time" },
      ],
    });
    renderForm(savedEvent);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Please fix the highlighted fields."),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Ends")).toHaveAccessibleDescription(
      "End time must be after start time",
    );
    expect(push).not.toHaveBeenCalled();
  });
});
