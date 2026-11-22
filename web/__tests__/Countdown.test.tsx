import { act, render, screen } from "@testing-library/react";
import { Countdown } from "@/components/Countdown";

beforeEach(() => {
  jest.useFakeTimers();
  // The browser's clock is deliberately WRONG (a day ahead): the countdown
  // must not depend on it
  jest.setSystemTime(new Date("2026-11-23T12:00:00.000Z"));
});
afterEach(() => jest.useRealTimers());

// The server said: it's 12:00:00 now, the hold ends at 12:05:00
const serverTime = "2026-11-22T12:00:00.000Z";
const expiresAt = "2026-11-22T12:05:00.000Z";

describe("Countdown", () => {
  it("starts from the server's time, not the browser's clock", () => {
    render(
      <Countdown
        expiresAt={expiresAt}
        serverTime={serverTime}
        onExpire={jest.fn()}
      />,
    );
    expect(screen.getByRole("timer")).toHaveTextContent("5:00");
  });

  it("counts down every second", () => {
    render(
      <Countdown
        expiresAt={expiresAt}
        serverTime={serverTime}
        onExpire={jest.fn()}
      />,
    );
    act(() => jest.advanceTimersByTime(61_000));
    expect(screen.getByRole("timer")).toHaveTextContent("3:59");
  });

  it("warns screen readers once when under a minute is left", () => {
    render(
      <Countdown
        expiresAt={expiresAt}
        serverTime={serverTime}
        onExpire={jest.fn()}
      />,
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    act(() => jest.advanceTimersByTime(4 * 60_000 + 1_000));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Less than a minute left to confirm.",
    );
  });

  it("stops at 0:00 and calls onExpire once", () => {
    const onExpire = jest.fn();
    render(
      <Countdown
        expiresAt={expiresAt}
        serverTime={serverTime}
        onExpire={onExpire}
      />,
    );
    act(() => jest.advanceTimersByTime(5 * 60_000 + 5_000));
    expect(screen.getByRole("timer")).toHaveTextContent("0:00");
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("keeps counting (doesn't restart) when it re-renders", () => {
    const { rerender } = render(
      <Countdown
        expiresAt={expiresAt}
        serverTime={serverTime}
        onExpire={jest.fn()}
      />,
    );
    act(() => jest.advanceTimersByTime(30_000));
    // A new onExpire function (a parent re-render) must not reset the time
    rerender(
      <Countdown
        expiresAt={expiresAt}
        serverTime={serverTime}
        onExpire={jest.fn()}
      />,
    );
    act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByRole("timer")).toHaveTextContent("4:29");
  });
});
