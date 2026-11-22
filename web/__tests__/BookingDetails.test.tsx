import { act, fireEvent, render, screen } from "@testing-library/react";
import { BookingDetails } from "@/components/BookingDetails";
import { ToastProvider } from "@/components/ui/Toast";
import type { Booking } from "@/lib/types";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh }),
}));

function mockFetchOnce(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "b1",
    reference: "TIX-7KQ2M9XA",
    status: "HELD",
    seats: 2,
    unitPricePence: 1200,
    totalPence: 2400,
    holdExpiresAt: "2026-11-22T12:05:00.000Z",
    createdAt: "2026-11-22T12:00:00.000Z",
    serverTime: "2026-11-22T12:00:00.000Z",
    event: {
      id: "e1",
      title: "Jazz night",
      startsAt: "2026-12-05T19:30:00.000Z",
      endsAt: "2026-12-05T22:00:00.000Z",
      timezone: "Europe/London",
      format: "ONLINE",
      venueName: null,
      venueAddress: null,
      meetingLink: null,
    },
    ...overrides,
  };
}

const labels = {
  date: "Saturday, 5 December 2026",
  time: "19:30 – 22:00 GMT",
  total: "£24",
};

function renderDetails(booking: Booking) {
  return render(
    <ToastProvider>
      <BookingDetails booking={booking} labels={labels} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe("BookingDetails", () => {
  it("shows a held booking with the countdown and a Confirm button", () => {
    renderDetails(makeBooking());
    expect(screen.getByText("Held")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("5:00");
    expect(screen.getByText("TIX-7KQ2M9XA")).toBeInTheDocument();
    expect(screen.getByText("2 · £24")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm booking" }),
    ).toBeEnabled();
  });

  it("confirms: shows You're going, a toast, and refreshes the page", async () => {
    mockFetchOnce(200, makeBooking({ status: "CONFIRMED" }));
    renderDetails(makeBooking());
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(await screen.findByText("You're going!")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/bookings/b1/confirm",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText("Booking confirmed")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the expired message when confirming is too late (409)", async () => {
    mockFetchOnce(409, {
      error: "Your hold has expired and the seats were released",
    });
    renderDetails(makeBooking());
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(
      await screen.findByText(
        "Your hold has expired and the seats were released.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm booking" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to the event" }),
    ).toHaveAttribute("href", "/events/e1");
  });

  it("switches to expired by itself when the countdown reaches 0:00", () => {
    jest.useFakeTimers();
    renderDetails(makeBooking());
    act(() => jest.advanceTimersByTime(5 * 60_000 + 1_000));
    expect(
      screen.getByText("Your hold has expired and the seats were released."),
    ).toBeInTheDocument();
    jest.useRealTimers();
  });

  it("shows a confirmed booking with the meeting link", () => {
    renderDetails(
      makeBooking({
        status: "CONFIRMED",
        holdExpiresAt: null,
        event: {
          ...makeBooking().event,
          meetingLink: "https://example.com/meet",
        },
      }),
    );
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Join the event online" }),
    ).toHaveAttribute("href", "https://example.com/meet");
  });

  it("shows an expired booking from the server", () => {
    renderDetails(makeBooking({ status: "EXPIRED" }));
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});
