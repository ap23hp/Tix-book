import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/Badge";

describe("Badge", () => {
  it("shows its text", () => {
    render(<Badge tone="success">Published</Badge>);
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("colours only the dot, and hides the dot from screen readers", () => {
    const { container } = render(<Badge tone="accent">Cancelled</Badge>);
    const dot = container.querySelector("[aria-hidden='true']");
    expect(dot).toHaveClass("bg-accent");
    expect(screen.getByText("Cancelled")).toHaveClass("text-ink");
  });

  it("is neutral by default", () => {
    const { container } = render(<Badge>Draft</Badge>);
    expect(container.querySelector("[aria-hidden='true']")).toHaveClass(
      "bg-ink-muted",
    );
  });
});
