import type { NextFunction, Request, Response } from "express";

// Methods that only read. Everything else (POST, PUT, PATCH, DELETE) changes data.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Defence in depth against CSRF, on top of SameSite=Lax cookies.
// Modern browsers send Sec-Fetch-Site on every request:
//   "same-origin" → from our own pages (through the Vercel rewrite)
//   "cross-site"  → from another website, e.g. a hidden form on evil.com
//   "same-site"   → from a sibling subdomain (we have none we trust)
// Missing header → not a browser (curl, tests, our own Next.js server): allow,
// because without a browser there is no cookie to steal a request with.
export function blockCrossSiteWrites(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const site = req.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") {
    res.status(403).json({ error: "Cross-site request blocked" });
    return;
  }

  next();
}