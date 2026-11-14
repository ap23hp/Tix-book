import { formatPrice, formatTimeRange, getCategoryStyle } from "@/lib/format";

describe("formatPrice", () => {
  it("shows Free for 0 pence", () => {
    expect(formatPrice(0)).toBe("Free");
  });

  it("drops .00 for whole pounds", () => {
    expect(formatPrice(1200)).toBe("£12");
  });

  it("keeps pence when there are some", () => {
    expect(formatPrice(850)).toBe("£8.50");
  });
});

describe("formatTimeRange", () => {
  it("shows GMT in winter", () => {
    expect(
      formatTimeRange("2027-01-08T20:00:00.000Z", "2027-01-08T22:00:00.000Z", "Europe/London"),
    ).toBe("20:00 – 22:00 GMT");
  });

  it("shows BST in summer, one hour ahead of UTC", () => {
    expect(
      formatTimeRange("2027-07-10T18:30:00.000Z", "2027-07-10T20:30:00.000Z", "Europe/London"),
    ).toBe("19:30 – 21:30 BST");
  });
});

describe("getCategoryStyle", () => {
  it("ignores capital letters and spaces", () => {
    expect(getCategoryStyle(" COMEDY ")).toEqual(getCategoryStyle("Comedy"));
  });

  it("falls back for unknown categories", () => {
    expect(getCategoryStyle("Food")).toEqual(getCategoryStyle("anything-else"));
  });
});