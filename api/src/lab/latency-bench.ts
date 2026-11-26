// LAB SCRIPT (phase 7): response times of the public event endpoints.
// Run: npm run lab:latency -- <base URL>   e.g. https://tixbook-api.onrender.com
// Read-only: it only sends GET requests, so it is safe against production.
//
// Each endpoint gets a few warm-up requests (Render may be waking up, and the
// first request opens the connection), then ROUNDS timed requests one after
// another on the same kept-alive connection. /health does no database work,
// so its time is roughly the network round trip; "endpoint − health" is
// roughly the time the API spends on the request (database, cache).

const base = (process.argv[2] ?? "http://localhost:4000").replace(/\/$/, "");
const WARMUP = 5;
const ROUNDS = 40;

// Time of one request, or null if it failed (e.g. a 502 from Render's proxy):
// failures are counted, not timed, so one bad answer doesn't stop the run
async function timeOnce(url: string): Promise<number | null> {
  const start = performance.now();
  const res = await fetch(url);
  await res.arrayBuffer(); // include reading the whole body
  if (!res.ok) return null;
  return performance.now() - start;
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, index)] ?? NaN;
}

async function measure(name: string, url: string) {
  for (let i = 0; i < WARMUP; i++) await timeOnce(url);
  const times: number[] = [];
  let failed = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const time = await timeOnce(url);
    if (time === null) failed++;
    else times.push(time);
  }
  times.sort((a, b) => a - b);
  return {
    endpoint: name,
    min: Math.round(times[0] ?? NaN),
    median: Math.round(percentile(times, 50)),
    p90: Math.round(percentile(times, 90)),
    max: Math.round(times.at(-1) ?? NaN),
    failed,
  };
}

// The first published event on the list is the "one event page" we time
const list = (await (await fetch(`${base}/api/v1/events`)).json()) as {
  events: { id: string }[];
};
const firstId = list.events[0]?.id;
if (!firstId) throw new Error("No published events to time");

const results = [
  await measure("/health", `${base}/health`),
  await measure("/api/v1/events", `${base}/api/v1/events`),
  await measure("/api/v1/events?q=a", `${base}/api/v1/events?q=a`),
  await measure("/api/v1/events/:id", `${base}/api/v1/events/${firstId}`),
];

console.log(
  `${base} — ${ROUNDS} requests each, times in ms, ${new Date().toISOString()}`,
);
console.table(results);
