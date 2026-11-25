// A small key-value store: the only Redis features the cache and the rate
// limiter use (phase 7, decision 061). Two versions:
// - UpstashStore (lib/upstash-store.ts): real Redis on Upstash, over HTTP
// - MemoryStore (below): a Map in this process. Tests use it, it's the
//   fallback when Redis is down, and it's used when no Redis is set up.
// Everything above this interface only knows these five methods, so it can't
// tell (and doesn't care) which store it's talking to.
//
// Values are strings. Times are milliseconds. Everything in here can be lost
// at any moment (expiry, restart, Redis down): Postgres is the source of truth.
export interface KeyValueStore {
  // The value, or null if the key doesn't exist (or has expired)
  get(key: string): Promise<string | null>;
  // Save a value that disappears after ttlMs
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  // Add 1 (a missing key counts as 0) and return the new number. The key
  // then expires at expiresAtMs (a Unix time in ms), so a counter can never
  // be left behind forever.
  incr(key: string, expiresAtMs: number): Promise<number>;
  // How many ms the key has left; 0 if it doesn't exist
  ttl(key: string): Promise<number>;
}

type Entry = { value: string; expiresAt: number };

export class MemoryStore implements KeyValueStore {
  private readonly entries = new Map<string, Entry>();

  // The clock is passed in so tests can move time without waiting
  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 10_000,
  ) {}

  // An expired entry is treated as missing, and removed when we see it
  private live(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlMs: number) {
    this.save(key, { value, expiresAt: this.now() + ttlMs });
  }

  async del(...keys: string[]) {
    for (const key of keys) this.entries.delete(key);
  }

  async incr(key: string, expiresAtMs: number) {
    const next = Number(this.live(key)?.value ?? 0) + 1;
    this.save(key, { value: String(next), expiresAt: expiresAtMs });
    return next;
  }

  // Memory is limited: while Redis is down, a flood of requests from many
  // IPs would otherwise add keys forever. Past maxEntries, drop expired
  // entries; if that isn't enough, drop the oldest (a Map keeps insertion
  // order). Losing a counter only makes a limit a little more forgiving.
  private save(key: string, entry: Entry) {
    this.entries.delete(key); // re-insert, so it counts as the newest
    this.entries.set(key, entry);
    if (this.entries.size <= this.maxEntries) return;
    const now = this.now();
    for (const [k, e] of this.entries) {
      if (e.expiresAt <= now) this.entries.delete(k);
    }
    for (const k of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(k);
    }
  }

  async ttl(key: string) {
    const entry = this.live(key);
    return entry ? entry.expiresAt - this.now() : 0;
  }

  // Forget everything (tests)
  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}
