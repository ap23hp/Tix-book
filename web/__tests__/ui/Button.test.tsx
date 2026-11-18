import { fireEvent, render, screen } from "@testing-library/react";
import { Button, buttonClass } from "@/components/ui/Button";

describe("Button", () => {
  it("is type=button by default, so it can't submit a form by accident", () => {
    const onSubmit = jest.fn((event: React.FormEvent) =>
      event.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <Button>Add seat</Button>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Add seat" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the form when type=submit", () => {
    const onSubmit = jest.fn((event: React.FormEvent) =>
      event.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Save</Button>
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("passes normal button props through (onClick, disabled)", () => {
    const onClick = jest.fn();
    render(
      <Button onClick={onClick} disabled>
        Retry
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Retry" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("uses the primary look unless told otherwise", () => {
    render(<Button>Book</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-accent");
  });

  it("adds the variant, size and extra classes", () => {
    render(
      <Button variant="secondary" size="sm" className="mt-6">
        Load more
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveClass("border-ink", "text-sm", "mt-6");
    expect(button).not.toHaveClass("bg-accent");
  });
});

describe("buttonClass", () => {
  it("gives links the same look as buttons", () => {
    expect(buttonClass({ className: "mt-6" })).toContain("bg-accent");
    expect(buttonClass({ className: "mt-6" })).toContain("mt-6");
  });
});
