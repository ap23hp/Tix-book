// Load .env first: this file reads its settings as soon as it is imported
import "dotenv/config";
import { createHash } from "node:crypto";
import { CircuitBreaker } from "./circuit-breaker.js";
import { MemoryStore, type KeyValueStore } from "./kv-store.js";
import { UpstashStore } from "./upstash-store.js";

// Which store the cache and the rate limiter use (decisions 061, 063).
// - Tests: always memory, even if Redis keys are in .env, so a test can
//   never touch a real Redis.
// - Both Upstash variables set: Redis, guarded by a circuit breaker.
// - Otherwise (e.g. a fresh clone): memory. One process, so it still works.

// Upstash's own names (what Redis.fromEnv() reads too)
const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

// The free plan has ONE database, shared by dev and production. Every key
// starts with a short hash of the database host, so the dev API and the
// live API can never read each other's cache or counters: a cached event
// from the dev database can't appear on the live site. No setting to forget.
// (A hash, so the host name itself isn't written into Redis.)
export function keyPrefixFor(databaseUrl: string | undefined): string {
  let host = "no-database";
  try {
    host = new URL(databaseUrl ?? "").hostname || host;
  } catch {
    // no or invalid DATABASE_URL: Prisma will complain about it anyway
  }
  const hash = createHash("sha256").update(host).digest("hex").slice(0, 8);
  return `tixbook:${hash}:`;
}
export const KEY_PREFIX = keyPrefixFor(process.env.DATABASE_URL);

// When Redis fails 3 times in a row (timeouts, network, 5xx), stop calling it
// for 30 s: while it's down, every request would otherwise wait for the
// 500 ms timeout first. Callers see a fast error and fall back.
export function guarded(
  store: KeyValueStore,
  now: () => number = Date.now,
): KeyValueStore {
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    cooldownMs: 30_000,
    now,
    onStateChange: (from, to) =>
      console.warn(`[redis] circuit ${from} -> ${to}`),
  });
  return {
    get: (key) => breaker.run(() => store.get(key)),
    set: (key, value, ttlMs) => breaker.run(() => store.set(key, value, ttlMs)),
    del: (...keys) => breaker.run(() => store.del(...keys)),
    incr: (key, at) => breaker.run(() => store.incr(key, at)),
    ttl: (key) => breaker.run(() => store.ttl(key)),
  };
}

function initialStore(): { store: KeyValueStore; kind: string } {
  if (process.env.NODE_ENV === "test") {
    return { store: new MemoryStore(), kind: "memory (tests)" };
  }
  if (url && token) {
    return {
      store: guarded(new UpstashStore(url, token)),
      kind: "Upstash Redis",
    };
  }
  return { store: new MemoryStore(), kind: "memory (no Upstash settings)" };
}

const initial = initialStore();
let current = initial.store;
export const storeKind = initial.kind;

export function store(): KeyValueStore {
  return current;
}

// Tests swap in their own store (e.g. one with a fake clock, or one that
// always fails, to play "Redis is down")
export function setStoreForTests(next: KeyValueStore) {
  current = next;
}
