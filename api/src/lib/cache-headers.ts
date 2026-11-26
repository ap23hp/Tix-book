import type { RequestHandler, Response } from "express";

// Cache-Control for the API (decision 072).
//
// Browsers reach the API through Vercel's rewrite, and Vercel's CDN honours
// the Cache-Control it gets from us. So every answer says who may keep it.

// The default for every /api response: nobody keeps a copy. Anything that
// depends on the session (my bookings, /auth/me, a ticket) must never be
// stored by a shared cache and shown to someone else.
export const NO_STORE = "private, no-store";

// Public GETs (event list, search, one event), the same for everyone:
// - max-age=0: the browser asks again every time (seats left changes)
// - s-maxage=5: Vercel's CDN may answer from its copy for 5 s
// - stale-while-revalidate=25: for 25 s more it may answer with the old
//   copy while it fetches a new one in the background
// So "seats left" on a page can be up to ~30 s old. That only affects what
// is shown: a hold always counts seats in Postgres, inside a transaction.
export const PUBLIC_SHORT =
  "public, max-age=0, s-maxage=5, stale-while-revalidate=25";

export const noStoreByDefault: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", NO_STORE);
  next();
};

// Call just before sending a 200 that is the same for every visitor
export function allowPublicCache(res: Response): void {
  res.set("Cache-Control", PUBLIC_SHORT);
}
