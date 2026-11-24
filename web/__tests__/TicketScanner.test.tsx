import { Activity } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TicketScanner } from "@/components/TicketScanner";
import { createQrDetector } from "@/lib/qr-detector";
import type { CheckInResult } from "@/lib/types";

// The real detector loads a WebAssembly file; jsdom has no camera anyway
jest.mock("@/lib/qr-detector", () => ({ createQrDetector: jest.fn() }));
const mockCreateQrDetector = createQrDetector as jest.Mock;

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as jest.Mock;
}

function renderScanner() {
  return render(<TicketScanner eventId="e1" timezone="Europe/London" />);
}

function submit(code: string) {
  fireEvent.change(screen.getByLabelText("Ticket code or booking reference"), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check ticket" }));
}

// 19:05 in London (GMT in December)
const AT = "2026-12-05T19:05:00.000Z";

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(navigator, "mediaDevices", {
    value: undefined,
    configurable: true,
  });
});

describe("TicketScanner: typing or pasting a code", () => {
  it("sends the event and the trimmed code, then says valid in words", async () => {
    mockFetch(200, {
      result: "valid",
      reference: "TIX-AAAA2222",
      seats: 2,
      checkedInAt: AT,
    } satisfies CheckInResult);
    renderScanner();
    submit("  TIX-AAAA2222 ");

    const status = screen.getByRole("status", { name: "Ticket check result" });
    expect(await screen.findByText("Valid: let them in")).toBeInTheDocument();
    expect(status).toHaveTextContent(
      "TIX-AAAA2222 · 2 seats. Checked in at 19:05.",
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/tickets/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ eventId: "e1", code: "TIX-AAAA2222" }),
      }),
    );
    // Ready for the next ticket
    expect(
      screen.getByLabelText("Ticket code or booking reference"),
    ).toHaveValue("");
  });

  it.each<[CheckInResult, string, string]>([
    [
      { result: "already_used", reference: "TIX-B", seats: 1, checkedInAt: AT },
      "Already used at 19:05",
      "TIX-B (1 seat) was checked in before. Don't let them in again.",
    ],
    [
      {
        result: "no_longer_valid",
        reference: "TIX-C",
        bookingStatus: "refunded",
      },
      "Not valid: booking refunded",
      "TIX-C can't be used to get in.",
    ],
    [
      {
        result: "no_longer_valid",
        reference: "TIX-D",
        bookingStatus: "cancelled",
      },
      "Not valid: booking cancelled",
      "TIX-D can't be used to get in.",
    ],
    [
      { result: "no_longer_valid", reference: "TIX-E", bookingStatus: "held" },
      "Not valid: booking not paid",
      "TIX-E can't be used to get in.",
    ],
    [
      { result: "wrong_event" },
      "Wrong event",
      "This ticket is for a different event.",
    ],
    [
      { result: "invalid", reason: "expired" },
      "Ticket expired",
      "This ticket is for an event that has ended.",
    ],
    [
      { result: "invalid", reason: "invalid" },
      "Not a valid ticket",
      "Check the code was copied in full, or ask for the booking reference.",
    ],
  ])("says %j in words, not colour only", async (body, title, detail) => {
    mockFetch(200, body);
    renderScanner();
    submit("some-code");

    // The result is inside the live region, so it's announced
    const status = screen.getByRole("status", { name: "Ticket check result" });
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(status).toHaveTextContent(title);
    expect(status).toHaveTextContent(detail);
    // The cross is decoration; the words carry the meaning
    expect(screen.queryByText("Valid: let them in")).not.toBeInTheDocument();
  });

  it("asks for a code instead of sending an empty one", () => {
    global.fetch = jest.fn();
    renderScanner();
    submit("   ");

    expect(
      screen.getByText("Enter a ticket code or booking reference"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Ticket code or booking reference"),
    ).toHaveAttribute("aria-invalid", "true");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("explains a 404 (not this organiser's event)", async () => {
    mockFetch(404, { error: "Event not found" });
    renderScanner();
    submit("TIX-AAAA2222");

    expect(
      await screen.findByText("This event wasn't found, or it isn't yours."),
    ).toBeInTheDocument();
  });
});

describe("TicketScanner: the camera", () => {
  function fakeCamera() {
    // A phone camera that can't do the 1920 x 1080 we ask for: with "ideal"
    // constraints it still opens, at the closest size it has
    const track = {
      stop: jest.fn(),
      getSettings: () => ({ width: 1280, height: 720 }),
    };
    const getUserMedia = jest.fn().mockResolvedValue({
      getTracks: () => [track],
      getVideoTracks: () => [track],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
    // jsdom can't play video
    jest
      .spyOn(window.HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    return { track, getUserMedia };
  }

  it("says so when the browser can't use the camera", () => {
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Scan with camera" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This browser can't use the camera here. Type or paste the code instead.",
    );
    expect(mockCreateQrDetector).not.toHaveBeenCalled();
  });

  it("checks a QR code the camera sees, once, and stops the camera on request", async () => {
    const { track, getUserMedia } = fakeCamera();
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    mockCreateQrDetector.mockResolvedValue({
      detect: jest.fn().mockResolvedValue([{ rawValue: "jwt-from-qr" }]),
    });
    mockFetch(200, {
      result: "valid",
      reference: "TIX-AAAA2222",
      seats: 2,
      checkedInAt: AT,
    });
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Scan with camera" }));

    expect(await screen.findByText("Valid: let them in")).toBeInTheDocument();
    // The back camera, at a high resolution, as preferences only
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    // In development, the size the browser really gave is logged
    expect(info).toHaveBeenCalledWith(
      "[scanner] camera asked for 1920 × 1080 (ideal), got 1280 × 720",
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/tickets/verify",
      expect.objectContaining({
        body: JSON.stringify({ eventId: "e1", code: "jwt-from-qr" }),
      }),
    );
    // The same QR code stays in front of the camera: not sent again
    await act(() => new Promise((r) => setTimeout(r, 700)));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Stop camera" }));
    expect(track.stop).toHaveBeenCalled();
    expect(screen.queryByLabelText(/^Camera view/)).not.toBeInTheDocument();
  });

  it("explains a refused camera permission", async () => {
    const { getUserMedia } = fakeCamera();
    getUserMedia.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );
    mockCreateQrDetector.mockResolvedValue({ detect: jest.fn() });
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Scan with camera" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Camera access was refused.",
    );
    expect(
      screen.getByRole("button", { name: "Scan with camera" }),
    ).toBeInTheDocument();
  });

  it("turns the camera off and clears the result when the page is hidden", async () => {
    const { track } = fakeCamera();
    mockCreateQrDetector.mockResolvedValue({
      detect: jest.fn().mockResolvedValue([{ rawValue: "jwt-from-qr" }]),
    });
    mockFetch(200, {
      result: "valid",
      reference: "TIX-AAAA2222",
      seats: 2,
      checkedInAt: AT,
    });
    const page = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <TicketScanner eventId="e1" timezone="Europe/London" />
      </Activity>
    );
    const { rerender } = render(page("visible"));
    fireEvent.click(screen.getByRole("button", { name: "Scan with camera" }));
    expect(await screen.findByText("Valid: let them in")).toBeInTheDocument();

    // Next.js hides pages you leave instead of removing them
    rerender(page("hidden"));
    expect(track.stop).toHaveBeenCalled();

    rerender(page("visible"));
    expect(screen.queryByText("Valid: let them in")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Scan with camera" }),
    ).toBeInTheDocument();
  });
});
