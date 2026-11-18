import { fireEvent, render, screen } from "@testing-library/react";
import { Select } from "@/components/ui/Select";

const options = [
  { value: "", label: "All" },
  { value: "IN_PERSON", label: "In person" },
  { value: "ONLINE", label: "Online" },
];

describe("Select", () => {
  it("is found by its label and shows every option", () => {
    render(<Select label="Format" name="format" options={options} />);

    const select = screen.getByLabelText("Format");
    expect(select).toHaveAttribute("name", "format");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All",
      "In person",
      "Online",
    ]);
  });

  it("sends the option's value, not its label", () => {
    const onChange = jest.fn();
    render(<Select label="Format" options={options} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Format"), {
      target: { value: "ONLINE" },
    });
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText("Format")).toHaveValue("ONLINE");
  });

  it("starts on defaultValue", () => {
    render(
      <Select label="Format" options={options} defaultValue="IN_PERSON" />,
    );
    expect(screen.getByLabelText("Format")).toHaveValue("IN_PERSON");
  });

  it("links the error to the select and marks it invalid", () => {
    render(
      <Select label="Category" options={options} error="Pick a category" />,
    );

    const select = screen.getByLabelText("Category");
    expect(select).toBeInvalid();
    expect(select).toHaveAccessibleDescription("Pick a category");
  });
});
