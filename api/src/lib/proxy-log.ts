import type { RequestHandler } from "express";

// The "[proxy]" log (decisions 064, 066): for the first few /api requests
// after each start, log how many addresses X-Forwarded-For holds, whether the
// request came through Vercel, and whether the connection is from loopback
// (rate limits skip loopback). Counts and yes/no only, never an address.
// Used to choose TRUST_PROXY_HOPS from evidence.
//
// After the first deploy, no lines appeared on Render and the cause wasn't
// found in the code (decision 066). So it also says when it is armed (at
// startup) and once when it stops, so silence can't be read two ways: no
// "armed" line means this code isn't what's running; "armed" with nothing
// after it means no /api request reached this process.

export const PROXY_LOG_LIMIT = 5;

const LOOPBACK = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

export function proxyArmedLine(limit: number = PROXY_LOG_LIMIT): string {
  return `[proxy] log armed for ${limit} /api requests`;
}

export const PROXY_LIMIT_REACHED_LINE =
  "[proxy] limit reached, no more lines until restart";

export function createProxyLogger(options: {
  limit?: number;
  log?: (line: string) => void;
  // Read per request, so the line shows the setting actually in use
  trustProxy: () => unknown;
}): RequestHandler {
  const log = options.log ?? ((line: string) => console.log(line));
  let left = options.limit ?? PROXY_LOG_LIMIT;
  // One "limit reached" line only, so the logs don't fill up
  let saidLimitReached = false;

  return (req, _res, next) => {
    if (left > 0) {
      left--;
      const forwarded = req.get("x-forwarded-for");
      const entries = forwarded ? forwarded.split(",").length : 0;
      const loopback = LOOPBACK.includes(req.socket.remoteAddress ?? "");
      log(
        `[proxy] x-forwarded-for entries=${entries} via-vercel=${Boolean(req.get("x-vercel-id"))} loopback=${loopback} trust-proxy=${String(options.trustProxy())}`,
      );
    } else if (!saidLimitReached) {
      saidLimitReached = true;
      log(PROXY_LIMIT_REACHED_LINE);
    }
    next();
  };
}
