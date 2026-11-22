import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/ui/Toast";

// Called on every render of SaveButtons, so we can count re-renders.
// (Not <Profiler>: it missed re-renders caused by a context change.)
const onCallerRender = jest.fn();

// A component that shows toasts, like a form would
function SaveButtons() {
  onCallerRender();
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast({ message: "Event saved" })}>
        Save
      </button>
      <button
        type="button"
        onClick={() => toast({ message: "Couldn't save", tone: "error" })}
      >
        Fail
      </button>
    </>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <SaveButtons />
    </ToastProvider>,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe("Toast", () => {
  it("has both live regions in the page before any toast is shown", () => {
    renderWithProvider();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("puts success toasts in the polite region (role=status)", () => {
    renderWithProvider();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("status")).toHaveTextContent("Event saved");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("puts error toasts in the assertive region (role=alert)", () => {
    renderWithProvider();
    fireEvent.click(screen.getByRole("button", { name: "Fail" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("reads only the new toast, not the whole region", () => {
    renderWithProvider();
    expect(screen.getByRole("status")).toHaveAttribute("aria-atomic", "false");
    expect(screen.getByRole("alert")).toHaveAttribute("aria-atomic", "false");
  });

  it("disappears by itself after 5 seconds", () => {
    renderWithProvider();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    act(() => jest.advanceTimersByTime(4999));
    expect(screen.getByText("Event saved")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText("Event saved")).not.toBeInTheDocument();
  });

  it("can be dismissed with its button", () => {
    renderWithProvider();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Event saved")).not.toBeInTheDocument();
  });

  it("waits while the mouse is over it, then starts the timer again", () => {
    renderWithProvider();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const toast = screen.getByText("Event saved").parentElement!;

    fireEvent.mouseEnter(toast);
    act(() => jest.advanceTimersByTime(10_000));
    expect(screen.getByText("Event saved")).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    act(() => jest.advanceTimersByTime(5000));
    expect(screen.queryByText("Event saved")).not.toBeInTheDocument();
  });

  it("waits while keyboard focus is inside it", () => {
    renderWithProvider();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    fireEvent.focus(screen.getByRole("button", { name: "Dismiss" }));
    act(() => jest.advanceTimersByTime(10_000));
    expect(screen.getByText("Event saved")).toBeInTheDocument();
  });

  it("doesn't re-render components that call toast()", () => {
    renderWithProvider();
    expect(onCallerRender).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() => jest.advanceTimersByTime(5000));

    // A toast was added and removed, but SaveButtons never re-rendered,
    // because the context value (the toast function) never changed
    expect(onCallerRender).toHaveBeenCalledTimes(1);
  });

  it("explains the mistake when used outside the provider", () => {
    // React logs the thrown error; keep the test output clean
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<SaveButtons />)).toThrow(
      "useToast() must be used inside <ToastProvider>",
    );
    spy.mockRestore();
  });
});
