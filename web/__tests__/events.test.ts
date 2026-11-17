import { readFilters, toQueryString } from "@/lib/events";

describe("readFilters", () => {
  it("keeps valid values from the URL", () => {
    expect(
      readFilters({ q: " jazz ", category: "Music", format: "ONLINE" }),
    ).toEqual({ q: "jazz", category: "Music", format: "ONLINE" });
  });

  it("drops values the API wouldn't accept", () => {
    expect(
      readFilters({ q: "", category: "Cooking", format: "PARTY" }),
    ).toEqual({ q: undefined, category: undefined, format: undefined });
  });

  it("uses the first value if a key appears twice", () => {
    expect(readFilters({ format: ["ONLINE", "IN_PERSON"] }).format).toBe(
      "ONLINE",
    );
  });
});

describe("toQueryString", () => {
  it("leaves out empty values", () => {
    expect(toQueryString({ q: "jazz", category: "", format: "ONLINE" })).toBe(
      "q=jazz&format=ONLINE",
    );
    expect(toQueryString({})).toBe("");
  });
});