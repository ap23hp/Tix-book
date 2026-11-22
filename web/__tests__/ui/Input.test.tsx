import { fireEvent, render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/Input";

describe("Input", () => {
  it("is found by its label", () => {
    render(<Input label="Email" name="email" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email");
  });

  it("passes normal input props through", () => {
    const onChange = jest.fn();
    render(<Input label="Seats" type="number" required onChange={onChange} />);

    const input = screen.getByLabelText("Seats");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toBeRequired();
    fireEvent.change(input, { target: { value: "4" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("links the error to the input and marks it invalid", () => {
    render(<Input label="Email" name="email" error="Enter a valid email" />);

    const input = screen.getByLabelText("Email");
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription("Enter a valid email");
  });

  it("reads both the hint and the error", () => {
    render(
      <Input label="Password" hint="At least 8 characters" error="Too short" />,
    );
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      "At least 8 characters Too short",
    );
  });

  it("is not marked invalid without an error", () => {
    render(<Input label="Email" />);
    const input = screen.getByLabelText("Email");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("gives two fields with the same name different ids", () => {
    // e.g. login and sign-up pages both in the DOM (one hidden by <Activity>)
    render(
      <>
        <Input label="Login email" name="email" />
        <Input label="Sign-up email" name="email" />
      </>,
    );
    expect(screen.getByLabelText("Login email").id).not.toBe(
      screen.getByLabelText("Sign-up email").id,
    );
  });
});
