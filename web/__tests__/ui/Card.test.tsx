import { render, screen } from "@testing-library/react";
import { Card } from "@/components/ui/Card";

describe("Card", () => {
  it("shows its content in a div by default", () => {
    const { container } = render(<Card>Hello</Card>);
    expect(container.firstChild?.nodeName).toBe("DIV");
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("can be an article or a section", () => {
    render(
      <>
        <Card as="article">
          <h2>Jazz night</h2>
        </Card>
        <Card as="section">
          <h2>Summary</h2>
        </Card>
      </>,
    );
    expect(screen.getByRole("article")).toHaveTextContent("Jazz night");
    // A <section> only counts as a "region" once it has a name, so check the tag
    expect(screen.getByText("Summary").parentElement?.nodeName).toBe("SECTION");
  });

  it("adds extra classes", () => {
    render(<Card className="mt-8">Hi</Card>);
    expect(screen.getByText("Hi")).toHaveClass("bg-surface", "mt-8");
  });
});
