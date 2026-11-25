import { Redis } from "@upstash/redis";
import type { KeyValueStore } from "./kv-store.js";

// The real store: Redis on Upstash, through its HTTP client (decision 061).
// Every call is one HTTPS request; there is no connection to keep open, so
// nothing breaks when Render sleeps and wakes up.

// Redis is an extra: a slow answer must never make a page slow. A request
// that takes longer than this is abandoned and treated as "Redis is down".
const TIMEOUT_MS = 500;

export class UpstashStore implements KeyValueStore {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({
      url,
      token,
      // The client's default is 5 retries with a growing wait (about 12 s in
      // all). Here a failure falls back straight away instead (cache miss,
      // or the in-memory limiter), so no retries.
      retry: false,
      // A new timer for every request (a function, not one shared signal)
      signal: () => AbortSignal.timeout(TIMEOUT_MS),
      // We store plain strings and parse JSON ourselves
      automaticDeserialization: false,
      // Don't send SDK/platform details to Upstash with every request
      enableTelemetry: false,
    });
  }

  async get(key: string) {
    return this.redis.get<string>(key);
  }

  async set(key: string, value: string, ttlMs: number) {
    await this.redis.set(key, value, { px: ttlMs });
  }

  async del(...keys: string[]) {
    if (keys.length > 0) await this.redis.del(...keys);
  }

  // INCR and PEXPIREAT go in ONE HTTP request (a pipeline). Not atomic, but
  // the expiry time is the same fixed time on every call, so whichever order
  // they run in, the key ends up expiring when it should. Upstash counts
  // this as 2 commands (my assumption: its docs don't say how pipelines are
  // counted, so the estimate in decision 062 counts each command).
  async incr(key: string, expiresAtMs: number) {
    const [count] = await this.redis
      .pipeline()
      .incr(key)
      .pexpireat(key, expiresAtMs)
      .exec<[number, number]>();
    return count;
  }

  async ttl(key: string) {
    // PTTL: -2 = no such key, -1 = no expiry (we never create those)
    const ms = await this.redis.pttl(key);
    return ms > 0 ? ms : 0;
  }
}
