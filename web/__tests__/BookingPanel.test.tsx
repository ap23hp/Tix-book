import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BookingPanel } from "@/components/BookingPanel";

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

function mockFetchOnce(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

// The JSON body of the n-th fetch call
function sentBody(n = 0) {
  const [, options] = (global.fetch as jest.Mock).mock.calls[n];
  return JSON.parse(options.body);
}

function renderPanel(
  overrides: Partial<Parameters<typeof BookingPanel>[0]> = {},
) {
  return render(
    <BookingPanel
      eventId="e1"
      eventTitle="Jazz night"
      pricePence={1200}
      seatsLeft={20}
      {...overrides}
    />,
  );
}

function openAndSubmit() {
  fireEvent.click(screen.getByRole("button", { name: "Book tickets" }));
  fireEvent.click(screen.getByRole("button", { name: "Hold seats" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe("BookingPanel", () => {
  it("holds the chosen seats and goes to the booking page", async () => {
    mockFetchOnce(201, { id: "b1" });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Book tickets" }));
    fireEvent.change(screen.getByLabelText("Seats"), {
      target: { value: "3" },
    });
    expect(screen.getByText("£36")).toBeInTheDocument(); // 3 × £12
    fireEvent.click(screen.getByRole("button", { name: "Hold seats" }));

    await screen.findByRole("button", { name: "Booking…" });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/events/e1/bookings",
      expect.objectContaining({ method: "POST" }),
    );
    expect(sentBody()).toMatchObject({ seats: 3 });
    expect(sentBody().idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    await new Promise((r) => setTimeout(r, 0));
    expect(push).toHaveBeenCalledWith("/bookings/b1");
  });

  it("closes the dialog before going to the booking page", async () => {
    mockFetchOnce(201, { id: "b1" });
    renderPanel();
    openAndSubmit();

    // An open modal on the (hidden) event page would block the next page
    await waitFor(() =>
      expect(document.querySelector("dialog")?.open).toBe(false),
    );
    expect(push).toHaveBeenCalledWith("/bookings/b1");
  });

  it("offers no more seats than are left (and never more than 10)", () => {
    const { unmount } = renderPanel({ seatsLeft: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Book tickets" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);
    unmount();

    renderPanel({ seatsLeft: 50 });
    fireEvent.click(screen.getByRole("button", { name: "Book tickets" }));
    expect(screen.getAllByRole("option")).toHaveLength(10);
  });

  it("sends the SAME key when you try again after an error", async () => {
    // First try: the network fails. Second try: it works.
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("offline"));
    mockFetchOnce(201, { id: "b1" });
    renderPanel();

    openAndSubmit();
    expect(
      await screen.findByText("Couldn't reach the server. Try again."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hold seats" }));
    await new Promise((r) => setTimeout(r, 0));

    expect(sentBody(1).idempotencyKey).toBe(sentBody(0).idempotencyKey);
  });

  it("uses a NEW key the next time the dialog is opened", async () => {
    mockFetchOnce(409, { error: "Sold out" });
    mockFetchOnce(201, { id: "b2" });
    renderPanel();

    openAndSubmit();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    openAndSubmit();
    await new Promise((r) => setTimeout(r, 0));

    expect(sentBody(1).idempotencyKey).not.toBe(sentBody(0).idempotencyKey);
  });

  it("says someone else got the last seats, and refreshes the seat count", async () => {
    mockFetchOnce(409, { error: "Sold out" });
    renderPanel();
    openAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sorry, someone else just got the last seats.",
    );
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("passes on 'only N left'", async () => {
    mockFetchOnce(409, { error: "Only 1 seat is left" });
    renderPanel();
    openAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only 1 seat is left. Choose fewer seats and try again.",
    );
  });

  it("sends you to log in when you're logged out", async () => {
    mockFetchOnce(401, { error: "Not logged in" });
    renderPanel();
    openAndSubmit();
    await new Promise((r) => setTimeout(r, 0));
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("shows a disabled Sold out button when no seats are left", () => {
    renderPanel({ seatsLeft: 0 });
    expect(screen.getByRole("button", { name: "Sold out" })).toBeDisabled();
  });

  it("says free events are booked straight away", () => {
    renderPanel({ pricePence: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Book free tickets" }));
    expect(
      screen.getByText(/Free events are booked straight away/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book" })).toBeInTheDocument();
  });
});
