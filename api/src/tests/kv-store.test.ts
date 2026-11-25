import { describe, it, expect, jest } from "@jest/globals";
import { MemoryStore, type KeyValueStore } from "../lib/kv-store.js";
import { guarded, keyPrefixFor } from "../lib/redis.js";
import { CircuitOpenError } from "../lib/circuit-breaker.js";

// The in-memory store (the tests' Redis, and the fallback when Redis is
// down), the key prefix, and the circuit breaker around Redis. No database.

describe("MemoryStore", () => {
  it("forgets a value when its time is up", async () => {
    let now = 1_000;
    const store = new MemoryStore(() => now);
    await store.set("a", "hello", 500);
    expect(await store.get("a")).toBe("hello");
    expect(await store.ttl("a")).toBe(500);
    now += 499;
    expect(await store.get("a")).toBe("hello");
    now += 1;
    expect(await store.get("a")).toBeNull();
    expect(await store.ttl("a")).toBe(0);
  });

  it("counts up, and the counter expires at the given time", async () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    expect(await store.incr("n", 1_000)).toBe(1);
    expect(await store.incr("n", 1_000)).toBe(2);
    expect(await store.ttl("n")).toBe(1_000);
    now = 1_000;
    // Expired: starts again from 1
    expect(await store.incr("n", 2_000)).toBe(1);
  });

  it("deletes several keys at once", async () => {
    const store = new MemoryStore();
    await store.set("a", "1", 1_000);
    await store.set("b", "2", 1_000);
    await store.del("a", "b", "missing");
    expect(await store.get("a")).toBeNull();
    expect(await store.get("b")).toBeNull();
  });

  it("never holds more than maxEntries: expired first, then the oldest", async () => {
    let now = 0;
    const store = new MemoryStore(() => now, 3);
    await store.set("expires-soon", "x", 10);
    await store.set("old", "x", 1_000);
    await store.set("middle", "x", 1_000);
    now = 20; // "expires-soon" has expired
    await store.set("new", "x", 1_000);
    expect(store.size).toBe(3);
    expect(await store.get("old")).toBe("x");

    await store.set("newest", "x", 1_000); // nothing expired: drop the oldest
    expect(store.size).toBe(3);
    expect(await store.get("old")).toBeNull();
    expect(await store.get("newest")).toBe("x");
  });
});

describe("key prefix", () => {
  it("is different for the dev and production databases, and hides the host", () => {
    const dev = keyPrefixFor(
      "postgresql://u:p@ep-dev-123.eu-central-1.aws.neon.tech/db",
    );
    const prod = keyPrefixFor(
      "postgresql://u:p@ep-prod-456.eu-central-1.aws.neon.tech/db",
    );
    expect(dev).not.toBe(prod);
    expect(dev).toMatch(/^tixbook:[0-9a-f]{8}:$/);
    expect(dev).not.toContain("neon");
    // Only the host counts (not the password), so it's stable
    expect(
      keyPrefixFor(
        "postgresql://x:y@ep-dev-123.eu-central-1.aws.neon.tech/other",
      ),
    ).toBe(dev);
  });
});

describe("circuit breaker around Redis", () => {
  it("stops calling a failing Redis after 3 failures, tries again after 30 s", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    let now = 0;
    const get = jest.fn(() => Promise.reject(new Error("timeout")));
    const failing = { get } as unknown as KeyValueStore;
    const store = guarded(failing, () => now);

    for (let i = 0; i < 3; i++) {
      await expect(store.get("k")).rejects.toThrow("timeout");
    }
    // Open: fails at once, Redis isn't called
    await expect(store.get("k")).rejects.toBeInstanceOf(CircuitOpenError);
    expect(get).toHaveBeenCalledTimes(3);

    // After the cool-down, one trial call goes through
    now += 30_000;
    get.mockImplementationOnce(() => Promise.resolve("back"));
    expect(await store.get("k")).toBe("back");
    expect(get).toHaveBeenCalledTimes(4);
  });
});
