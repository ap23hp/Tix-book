import { KEY_PREFIX, store } from "./redis.js";

// Cache for the public event list and event pages (decision 063).
//
// What is cached: the EVENT ROWS (title, dates, venue, price, seat limit...).
// What is never cached: seats left. It changes with every booking, and also
// on its own when a 5-minute hold runs out, with no write we could hook
// into. So the routes add seats left from Postgres on every request, cache
// hit or not, and a cached page can never show a wrong number.
// Booking, holds, payments and check-in never read this cache: they only
// use Postgres (and lock the row).
//
// Invalidation: every key contains a version number. Creating or editing an
// event adds 1 to the version, so every older key is simply never read again
// (and expires on its own). One write invalidates every list variant
// (category, format, cursor...) and every event page at once.

const TTL_MS = 30_000; // safety net if an invalidation is ever missed
const VERSION_KEY = `${KEY_PREFIX}events:version`;
// The version key expires too (it's only a counter); a fresh one starts at 0
// again, which is fine: by then, every older entry has long expired.
const VERSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Read the version; any Redis problem → null (then we skip the cache)
async function currentVersion(): Promise<string | null> {
  try {
    return (await store().get(VERSION_KEY)) ?? "0";
  } catch {
    return null;
  }
}

// The cached value for `name`, or load it from Postgres and cache it.
// Redis down or broken → just load it (the page works, only slower).
//
// Both paths return the value after a JSON round trip, so a cache hit and a
// miss give exactly the same thing (e.g. dates are always strings).
export async function cachedEvents<T>(
  name: string,
  load: () => Promise<T>,
): Promise<T> {
  // The version is read BEFORE Postgres. If an organiser edits the event
  // while we're loading, they bump the version, so what we save goes under
  // the old version, which nobody reads any more: a slow request can't put
  // an old copy back into the cache.
  const version = await currentVersion();
  const key =
    version === null ? null : `${KEY_PREFIX}events:v${version}:${name}`;

  if (key) {
    try {
      const hit = await store().get(key);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch {
      // treat as a miss
    }
  }

  const value = await load();
  const json = JSON.stringify(value);
  // "Not found" isn't cached: random ids would fill Redis (and use up
  // commands) with entries nobody reads again
  if (key && value !== null) {
    // Not awaited: the answer doesn't wait for Redis to save
    store()
      .set(key, json, TTL_MS)
      .catch(() => {});
  }
  return JSON.parse(json) as T;
}

// Call AFTER the change is saved in Postgres. If Redis is down, the old
// copies stay until their 30 s expiry (logged, so we'd know).
export async function invalidateEvents(): Promise<void> {
  try {
    await store().incr(VERSION_KEY, Date.now() + VERSION_TTL_MS);
  } catch (err) {
    console.warn(
      "[cache] couldn't invalidate the event cache; old copies expire within 30 s:",
      err instanceof Error ? err.name : "unknown error",
    );
  }
}
