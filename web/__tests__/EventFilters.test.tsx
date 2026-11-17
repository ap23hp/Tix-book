import { act, fireEvent, render, screen } from "@testing-library/react";
import { EventFilters } from "@/components/EventFilters";

const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

function type(value: string) {
  fireEvent.change(screen.getByLabelText("Search events"), {
    target: { value },
  });
}

describe("EventFilters", () => {
  it("waits until typing pauses, then puts only the last value in the URL", () => {
    render(<EventFilters initial={{}} />);

    // Fast typing: each keystroke cancels the previous timer
    type("j");
    act(() => jest.advanceTimersByTime(100));
    type("ja");
    act(() => jest.advanceTimersByTime(100));
    type("jazz");
    expect(replace).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(300));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/?q=jazz", { scroll: false });
  });

  it("adds category and format to the URL", () => {
    render(<EventFilters initial={{}} />);

    fireEvent.change(screen.getByLabelText("Format"), {
      target: { value: "ONLINE" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Music" },
    });
    act(() => jest.advanceTimersByTime(300));

    expect(replace).toHaveBeenLastCalledWith(
      "/?category=Music&format=ONLINE",
      { scroll: false },
    );
  });

  it("Clear goes back to all events", () => {
    render(<EventFilters initial={{ q: "jazz", format: "ONLINE" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    act(() => jest.advanceTimersByTime(300));

    expect(screen.getByLabelText("Search events")).toHaveValue("");
    expect(replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("doesn't change the URL when nothing changed", () => {
    render(<EventFilters initial={{ q: "jazz" }} />);
    act(() => jest.advanceTimersByTime(1000));

    expect(replace).not.toHaveBeenCalled();
  });

  it("follows the URL when it changes from outside (e.g. 'Show all events')", () => {
    const { rerender } = render(<EventFilters initial={{ q: "jazz" }} />);
    expect(screen.getByLabelText("Search events")).toHaveValue("jazz");

    // The page re-renders with a new URL that this component didn't set
    rerender(<EventFilters initial={{}} />);
    act(() => jest.advanceTimersByTime(1000));

    expect(screen.getByLabelText("Search events")).toHaveValue("");
    // ...and it doesn't push the old search back into the URL
    expect(replace).not.toHaveBeenCalled();
  });
});