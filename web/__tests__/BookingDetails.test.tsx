import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { BookingDetails } from "@/components/BookingDetails";
import { ToastProvider } from "@/components/ui/Toast";
import type { Booking } from "@/lib/types";
import { MAX_POLLS, POLL_MS } from "@/lib/use-payment-confirmation";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh }),
}));

const goToExternal = jest.fn();
jest.mock("@/lib/navigate", () => ({
  goToExternal: (url: string) => goToExternal(url),
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

function renderDetails(
  booking: Booking,
  payment: "success" | "cancelled" | null = null,
  ticketQr: string | null = null,
) {
  return render(
    <ToastProvider>
      <BookingDetails
        booking={booking}
        labels={labels}
        payment={payment}
        ticketQr={ticketQr}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe("BookingDetails", () => {
  it("shows a held booking with the countdown and a Pay button", () => {
    renderDetails(makeBooking());
    expect(screen.getByText("Held")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("5:00");
    expect(screen.getByText("TIX-7KQ2M9XA")).toBeInTheDocument();
    expect(screen.getByText("2 · £24")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pay £24 with Stripe" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Confirm booking" }),
    ).not.toBeInTheDocument();
  });

  it("Pay asks the API for a checkout page and goes there", async () => {
    mockFetchOnce(200, { url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    renderDetails(makeBooking());
    fireEvent.click(
      screen.getByRole("button", { name: "Pay £24 with Stripe" }),
    );

    expect(
      await screen.findByRole("button", { name: "Opening Stripe…" }),
    ).toBeDisabled();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/bookings/b1/checkout",
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() =>
      expect(goToExternal).toHaveBeenCalledWith(
        "https://checkout.stripe.com/c/pay/cs_test_1",
      ),
    );
  });

  it("shows the server's message and refreshes when paying is too late (409)", async () => {
    mockFetchOnce(409, {
      error: "Your hold has expired and the seats were released",
    });
    renderDetails(makeBooking());
    fireEvent.click(
      screen.getByRole("button", { name: "Pay £24 with Stripe" }),
    );

    // Found by text: the toast area is also an (empty) alert region
    expect(
      await screen.findByText(
        "Your hold has expired and the seats were released",
      ),
    ).toHaveAttribute("role", "alert");
    expect(refresh).toHaveBeenCalled();
    expect(goToExternal).not.toHaveBeenCalled();
  });

  it("says the payment was cancelled and keeps the hold", () => {
    renderDetails(makeBooking(), "cancelled");
    expect(
      screen.getByText(/Payment cancelled\. Your seats are still held/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pay £24 with Stripe" }),
    ).toBeEnabled();
  });

  it("back from Stripe: says confirming (not confirmed) until the API agrees", async () => {
    jest.useFakeTimers();
    // First check: the webhook hasn't arrived. Second: it has.
    mockFetchOnce(200, makeBooking());
    mockFetchOnce(200, makeBooking({ status: "CONFIRMED" }));
    renderDetails(makeBooking(), "success");

    expect(
      screen.getByText("Payment received. Confirming your booking…"),
    ).toBeInTheDocument();
    expect(screen.queryByText("You're going!")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Pay/ }),
    ).not.toBeInTheDocument();

    await act(async () => jest.advanceTimersByTime(POLL_MS));
    expect(screen.queryByText("You're going!")).not.toBeInTheDocument();
    await act(async () => jest.advanceTimersByTime(POLL_MS));

    expect(screen.getByText("You're going!")).toBeInTheDocument();
    expect(screen.getByText("Payment confirmed")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/bookings/b1",
      expect.objectContaining({ cache: "no-store" }),
    );
    jest.useRealTimers();
  });

  it("keeps waiting (not 'expired') when the hold ran out while paying", async () => {
    jest.useFakeTimers();
    mockFetchOnce(200, makeBooking({ status: "REFUNDED" }));
    renderDetails(makeBooking({ status: "EXPIRED" }), "success");
    expect(
      screen.queryByText("Your hold has expired and the seats were released."),
    ).not.toBeInTheDocument();

    await act(async () => jest.advanceTimersByTime(POLL_MS));
    expect(
      screen.getByText("Your payment was refunded in full."),
    ).toBeInTheDocument();
    jest.useRealTimers();
  });

  it("says it's taking longer after the last check, and stops asking", async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeBooking()),
    });
    renderDetails(makeBooking(), "success");
    for (let i = 0; i < MAX_POLLS; i++) {
      await act(async () => jest.advanceTimersByTime(POLL_MS));
    }
    expect(
      screen.getByText("This is taking longer than usual."),
    ).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(MAX_POLLS);

    await act(async () => jest.advanceTimersByTime(POLL_MS * 5));
    expect(global.fetch).toHaveBeenCalledTimes(MAX_POLLS);
    jest.useRealTimers();
  });

  it("stops asking when the page goes away", async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeBooking()),
    });
    const { unmount } = renderDetails(makeBooking(), "success");
    await act(async () => jest.advanceTimersByTime(POLL_MS));
    unmount();
    await act(async () => jest.advanceTimersByTime(POLL_MS * 10));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("shows the ticket QR code on a confirmed booking", () => {
    renderDetails(
      makeBooking({ status: "CONFIRMED", holdExpiresAt: null }),
      null,
      "data:image/svg+xml;utf8,%3Csvg%3E%3C%2Fsvg%3E",
    );
    expect(
      screen.getByRole("img", {
        name: "Ticket QR code for booking TIX-7KQ2M9XA",
      }),
    ).toHaveAttribute("src", "data:image/svg+xml;utf8,%3Csvg%3E%3C%2Fsvg%3E");
  });

  it("draws the QR code to fill the card, with no CSS padding", () => {
    renderDetails(
      makeBooking({ status: "CONFIRMED", holdExpiresAt: null }),
      null,
      "data:image/svg+xml;utf8,%3Csvg%3E%3C%2Fsvg%3E",
    );
    const qr = screen.getByRole("img", {
      name: "Ticket QR code for booking TIX-7KQ2M9XA",
    });
    // The quiet zone is inside the image; padding would only shrink the code
    expect(qr).toHaveClass("w-full", "bg-white");
    expect(qr.className).not.toMatch(/\bp-\d/);
  });

  it("shows the QR code full screen, and closes again", () => {
    const { container } = renderDetails(
      makeBooking({ status: "CONFIRMED", holdExpiresAt: null }),
      null,
      "data:image/svg+xml;utf8,%3Csvg%3E%3C%2Fsvg%3E",
    );
    const qrName = "Ticket QR code for booking TIX-7KQ2M9XA";
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The full-screen copy is only drawn while open. (A closed <dialog> is
    // hidden from role queries, so count the <img> elements themselves.)
    expect(container.querySelectorAll("img")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Show full screen" }));

    const dialog = screen.getByRole("dialog", { name: "Your ticket" });
    expect(dialog).toHaveClass("h-dvh", "w-screen");
    expect(dialog).toHaveTextContent("TIX-7KQ2M9XA");
    expect(within(dialog).getByRole("img", { name: qrName })).toHaveAttribute(
      "src",
      "data:image/svg+xml;utf8,%3Csvg%3E%3C%2Fsvg%3E",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Back to a single ticket image on the page
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("has no full screen button without a QR code", () => {
    renderDetails(makeBooking({ status: "CONFIRMED", holdExpiresAt: null }));
    expect(
      screen.queryByRole("button", { name: "Show full screen" }),
    ).not.toBeInTheDocument();
  });

  it("still shows the reference when there's no QR code", () => {
    renderDetails(makeBooking({ status: "CONFIRMED", holdExpiresAt: null }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getAllByText("TIX-7KQ2M9XA").length).toBeGreaterThan(0);
  });

  it("shows a refunded booking with the reason", () => {
    renderDetails(makeBooking({ status: "REFUNDED" }));
    expect(screen.getByText("Refunded")).toBeInTheDocument();
    expect(
      screen.getByText("Your payment was refunded in full."),
    ).toBeInTheDocument();
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
