// LAB SCRIPT (phase 7): check the real Upstash store works, by hand.
// Run: npm run lab:redis   (needs UPSTASH_REDIS_REST_URL and _TOKEN in .env)
//
// The tests always use the in-memory store, so this is the one place the
// real UpstashStore is exercised. It uses its own keys (under
// "<prefix>lab-check:"), deletes them at the end, and never prints the URL
// or the token. About 15 commands per run.

import "dotenv/config";
import { UpstashStore } from "../lib/upstash-store.js";
import { KEY_PREFIX } from "../lib/redis.js";

const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
if (!url || !token) {
  throw new Error(
    "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in api/.env first",
  );
}

const store = new UpstashStore(url, token);
const key = (name: string) => `${KEY_PREFIX}lab-check:${name}`;

function check(what: string, ok: boolean) {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) process.exitCode = 1;
}

async function timed<T>(call: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await call();
  return [result, Math.round(performance.now() - start)];
}

try {
  const [, setMs] = await timed(() => store.set(key("a"), "hello", 5_000));
  const [value, getMs] = await timed(() => store.get(key("a")));
  check(
    `set + get a value (set ${setMs} ms, get ${getMs} ms)`,
    value === "hello",
  );

  const ttl = await store.ttl(key("a"));
  check(`ttl is about 5 s (${ttl} ms)`, ttl > 3_000 && ttl <= 5_000);

  check(
    "a missing key reads as null",
    (await store.get(key("missing"))) === null,
  );
  check("a missing key has ttl 0", (await store.ttl(key("missing"))) === 0);

  const expiresAt = Date.now() + 10_000;
  const [first, incrMs] = await timed(() => store.incr(key("n"), expiresAt));
  const second = await store.incr(key("n"), expiresAt);
  check(
    `incr counts 1, 2 (pipeline ${incrMs} ms)`,
    first === 1 && second === 2,
  );
  const counterTtl = await store.ttl(key("n"));
  check(
    `the counter expires at the given time (${counterTtl} ms left)`,
    counterTtl > 5_000 && counterTtl <= 10_000,
  );

  // A short TTL really expires on Redis's side
  await store.set(key("short"), "x", 300);
  await new Promise((resolve) => setTimeout(resolve, 600));
  check(
    "a 300 ms value is gone after 600 ms",
    (await store.get(key("short"))) === null,
  );

  // A JSON value survives the round trip as text (automaticDeserialization off)
  await store.set(key("json"), JSON.stringify({ a: 1 }), 5_000);
  check(
    "JSON comes back as the same string",
    (await store.get(key("json"))) === '{"a":1}',
  );
} finally {
  await store.del(key("a"), key("n"), key("short"), key("json"));
  console.log("cleaned up the lab-check keys");
}
