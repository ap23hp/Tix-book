import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/datetime";

// The form uses the BROWSER's time zone. jest.config.ts pins tests to
// Europe/London, so "the browser" here is in London.

describe("datetime-local conversion (browser's time zone)", () => {
  it("shows a winter time in London as GMT (same as UTC)", () => {
    expect(toDateTimeLocal("2026-12-05T19:30:00.000Z")).toBe(
      "2026-12-05T19:30",
    );
  });

  it("shows a summer time as BST (UTC + 1), so it's local time, not UTC", () => {
    // A plain toISOString().slice(0, 16) would wrongly give "18:30"
    expect(toDateTimeLocal("2026-07-01T18:30:00.000Z")).toBe(
      "2026-07-01T19:30",
    );
  });

  it("round-trips: what the edit form shows is saved back unchanged", () => {
    for (const saved of [
      "2026-07-01T18:30:00.000Z", // summer (BST)
      "2026-12-05T19:30:00.000Z", // winter (GMT)
    ]) {
      expect(fromDateTimeLocal(toDateTimeLocal(saved))).toBe(saved);
    }
  });

  it("reads typed values in the browser's zone (as the create form does)", () => {
    expect(fromDateTimeLocal("2026-07-01T19:30")).toBe(
      "2026-07-01T18:30:00.000Z",
    );
    expect(fromDateTimeLocal("")).toBeUndefined();
  });
});
