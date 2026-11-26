import { render, screen } from "@testing-library/react";
import { EventListSkeleton } from "@/components/Skeletons";

// The home page's loading state must have the same shape as the real page
// (filters, then two rows of cards), or the footer jumps when the list
// arrives: a layout shift (CLS). Decision 072; measured with
// scripts/vitals.mjs.
describe("EventListSkeleton", () => {
  it("tells screen readers it's loading", () => {
    const { container } = render(<EventListSkeleton />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading events…");
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
  });

  it("has room for the three filter fields and two rows of three cards", () => {
    const { container } = render(<EventListSkeleton />);
    const [filters, , cards] = Array.from(
      container.firstElementChild!.children,
    ).filter((el) => el.tagName === "DIV");
    expect(filters!.children).toHaveLength(3);
    expect(cards!.children).toHaveLength(6);
  });
});
