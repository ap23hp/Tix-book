import { createHash } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { HttpError } from "./errors.js";
import { MemoryStore, type KeyValueStore } from "./kv-store.js";
import { KEY_PREFIX, store } from "./redis.js";

// Rate limiting (phase 7, decisions 064 and 065).
//
// 1. Per IP, a fixed window: at most `limit` requests per window, counted in
//    one key per window. Over the limit → 429 with Retry-After (seconds until
//    the window ends).
// 2. Login, per account: after 5 failed logins for an email, each next try
//    must wait 30 s, then 1, 2, 4, 8 minutes, at most 15. A correct password
//    clears it. Counts are forgotten 24 h after the last failure. Never a
//    permanent lockout: anyone who knows your email could lock you out.
//
// If Redis fails, the counting moves to memory in this process (see
// `counted` below): limits keep working, just per process and reset on
// restart. Not "fail open" (no limits at all) and not "fail closed" (refuse
// everyone, so Redis being down would break logging in).

export const LIMITS = {
  login: { limit: 10, windowMs: 60_000 }, // 10 a minute
  signup: { limit: 10, windowMs: 60 * 60_000 }, // 10 an hour
  hold: { limit: 30, windowMs: 60_000 }, // seat holds, 30 a minute
  ticketVerify: { limit: 120, windowMs: 60_000 }, // door scans, 2 a second
} as const;
export type LimitName = keyof typeof LIMITS;

export const LOGIN_BACKOFF = {
  freeFailures: 5, // failures before any wait
  firstWaitMs: 30_000,
  maxWaitMs: 15 * 60_000,
  forgetAfterMs: 24 * 60 * 60_000,
};

// Should requests whose TCP connection comes from this machine (loopback)
// skip the limits? Only when RATE_LIMIT_EXEMPT_LOOPBACK is exactly "true":
// local development and local e2e runs set it in api/.env, and the tests set
// it in jest.setup-env.js. Missing or anything else → limits apply.
// It must be opt-in: on Render every request arrives from Render's proxy on
// loopback ("[proxy] ... loopback=true"), so an exemption that is on by
// default switched every limit off in production (decision 067).
export function exemptLoopbackFromEnv(value: string | undefined): boolean {
  return value?.trim() === "true";
}

export const rateLimitSettings = {
  exemptLoopback: exemptLoopbackFromEnv(process.env.RATE_LIMIT_EXEMPT_LOOPBACK),
  now: () => Date.now(),
};

// Used when Redis fails: same logic, kept in memory (one per process)
const fallback = new MemoryStore(() => rateLimitSettings.now());

// Run `op` on Redis; if Redis fails (down, timeout, circuit open), run it
// on the in-memory fallback instead
async function counted<T>(op: (s: KeyValueStore) => Promise<T>): Promise<T> {
  try {
    return await op(store());
  } catch {
    return op(fallback);
  }
}

// IPs and emails are hashed before they go into a key: Redis is another
// company's server, and the key only needs to tell people apart
function hashed(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
function isExempt(req: Request): boolean {
  return (
    rateLimitSettings.exemptLoopback &&
    LOOPBACK.has(req.socket.remoteAddress ?? "")
  );
}

function tooMany(res: Response, waitMs: number): never {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  res.set("Retry-After", String(seconds));
  // One message for every limit, so a 429 never says whether an account
  // exists or is being guessed (OWASP: the same answer either way)
  throw new HttpError(
    429,
    `Too many attempts. Please wait ${seconds} seconds and try again.`,
  );
}

// Middleware: limit this route per client IP. req.ip depends on the
// "trust proxy" setting in app.ts (behind Vercel and Render).
export function limitByIp(name: LimitName): RequestHandler {
  const { limit, windowMs } = LIMITS[name];
  return async (req, res, next) => {
    if (isExempt(req)) return next();

    const now = rateLimitSettings.now();
    // Fixed windows: minute 0-1, 1-2, ... Each window has its own key that
    // expires when the window ends, so nothing needs cleaning up.
    const window = Math.floor(now / windowMs);
    const windowEnd = (window + 1) * windowMs;
    const key = `${KEY_PREFIX}rl:${name}:${hashed(req.ip ?? "unknown")}:${window}`;

    const count = await counted((s) => s.incr(key, windowEnd));
    if (count > limit) tooMany(res, windowEnd - now);
    next();
  };
}

// ---------- Login: per account ----------

function accountKeys(email: string) {
  // The login schema already trims and lowercases the email
  const id = hashed(email);
  return {
    failures: `${KEY_PREFIX}rl:login-fail:${id}`,
    wait: `${KEY_PREFIX}rl:login-wait:${id}`,
  };
}

// The wait after `failures` failed logins in a row: none for the first 5,
// then 30 s, doubling each time, at most 15 minutes
export function waitAfterFailures(failures: number): number {
  const extra = failures - LOGIN_BACKOFF.freeFailures;
  if (extra < 0) return 0;
  return Math.min(
    LOGIN_BACKOFF.firstWaitMs * 2 ** extra,
    LOGIN_BACKOFF.maxWaitMs,
  );
}

// Before checking the password: is this email still in its wait?
// Checked for every email, existing or not, so the answer is the same.
export async function checkLoginWait(
  req: Request,
  res: Response,
  email: string,
): Promise<void> {
  if (isExempt(req)) return;
  const waitMs = await counted((s) => s.ttl(accountKeys(email).wait));
  if (waitMs > 0) tooMany(res, waitMs);
}

export async function recordLoginFailure(
  req: Request,
  email: string,
): Promise<void> {
  if (isExempt(req)) return;
  const keys = accountKeys(email);
  const now = rateLimitSettings.now();
  await counted(async (s) => {
    const failures = await s.incr(
      keys.failures,
      now + LOGIN_BACKOFF.forgetAfterMs,
    );
    const waitMs = waitAfterFailures(failures);
    if (waitMs > 0) await s.set(keys.wait, "1", waitMs);
  });
}

// A correct password: start again from zero
export async function clearLoginFailures(email: string): Promise<void> {
  const keys = accountKeys(email);
  await counted((s) => s.del(keys.failures, keys.wait));
}
