import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Test files share the dev database and run in parallel. Each one deletes its
// own data in afterAll by an email prefix (`startsWith`). If one file's prefix
// is the start of another's ("auth-test-" and "auth-test-ratelimit-"), the
// first file deletes the second file's users while it is still running, and
// tests fail at random (issue #83). This keeps the prefixes apart.

const testsDir = fileURLToPath(new URL(".", import.meta.url));

// Every cleanup prefix in every test file: `const PREFIX = "..."` and
// `startsWith: "..."` (except Stripe event ids, which aren't emails)
function prefixesByFile(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const file of readdirSync(testsDir)) {
    if (!file.endsWith(".test.ts") || file === "test-prefixes.test.ts")
      continue;
    const source = readFileSync(`${testsDir}/${file}`, "utf8");
    const pattern = /(?:const PREFIX = |startsWith: )"([^"]+)"/g;
    const prefixes = new Set<string>();
    for (const match of source.matchAll(pattern)) {
      const prefix = match[1];
      if (prefix && !prefix.startsWith("evt_")) prefixes.add(prefix);
    }
    if (prefixes.size > 0) found.set(file, prefixes);
  }
  return found;
}

describe("test cleanup prefixes", () => {
  it("finds the prefixes (so the check below isn't empty)", () => {
    const found = prefixesByFile();
    expect(found.get("auth.test.ts")).toEqual(new Set(["auth-test-"]));
    expect(found.get("rate-limit.test.ts")).toEqual(
      new Set(["ratelimit-test-"]),
    );
    expect(found.size).toBeGreaterThanOrEqual(12);
  });

  it("no file's prefix is the start of another file's prefix", () => {
    const all = [...prefixesByFile()].flatMap(([file, prefixes]) =>
      [...prefixes].map((prefix) => ({ file, prefix })),
    );
    const overlaps = all.flatMap((a) =>
      all
        .filter((b) => a.file !== b.file && b.prefix.startsWith(a.prefix))
        .map((b) => `${a.file} "${a.prefix}" deletes ${b.file} "${b.prefix}"`),
    );
    expect(overlaps).toEqual([]);
  });
});
