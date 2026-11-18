import { render, screen } from "@testing-library/react";
import { Spinner } from "@/components/ui/Spinner";

describe("Spinner", () => {
  it("tells screen readers what is loading", () => {
    render(<Spinner label="Loading events" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading events");
  });

  it("says 'Loading' when no label is given", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });

  it("hides the drawing from screen readers", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("stops spinning for people who prefer reduced motion", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("svg")).toHaveClass(
      "motion-reduce:animate-none",
    );
  });
});
