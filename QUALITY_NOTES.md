# Quality Notes

Testing approach, accessibility checks, known issues and things to review.

## Code quality tools
- **web/**: ESLint (from Next.js) + Prettier. Scripts: `lint`, `format`, `format:check`.
- **api/**: ESLint (typescript-eslint recommended) + Prettier. Scripts: `lint`, `format`, `format:check`, `build`.
- AGENTS.md is excluded from Prettier because `next dev` regenerates it.

## Database limits (Neon free plan)
- 100 CU-hours of compute per month, 0.5 GB storage, 5 GB transfer. Compute sleeps after 5 minutes idle.
- **Risk (phase 4):** a cron job querying the database every minute keeps it awake 24/7 (~180 CU-hours/month, over the limit). Design hold expiry to stay under the limit.
- Keep `/health` free of database queries, so uptime monitoring doesn't wake the database.
-I will have to design my  scheduled jobs around my database’s compute budget.

## Seed script (api/prisma/seed.ts)
- ⚠️ The seed script deletes ALL users, events and bookings before adding sample data.
- Development only. Never run `npx prisma db seed` against a production database.
- Run with: `npx prisma db seed` (inside api/)
- Creates: 5 users (2 organisers, 3 attendees), 6 events (paid/free, in person/online, draft, cancelled, sold out), 3 bookings.
- `faker.seed(42)` keeps the fake text the same every run.
- To do later: add a safety check so the script refuses to run in production (e.g. check NODE_ENV).

## Events API (api/src/routes/events.ts)
- Public endpoints hide `meetingLink` using Prisma `omit`. The link should only appear on a booked ticket (later ticket).
  - Possible improvement: use `select` (allowlist) instead of `omit`, so any new private field is hidden by default.
- GET /events/:id returns 404 for drafts and cancelled events, the same as for missing events (doesn't reveal hidden events).
- Seats left = seatLimit − seats taken (decision 005). Taken = the sum of `seats` in CONFIRMED bookings plus HELD bookings whose `holdExpiresAt` is still in the future. One function (`api/src/lib/seats.ts`) is used by both the event list and the event page, so they can't disagree.
- ✅ (phase 3) Expired holds no longer count as taken, even before the phase 4 cron job marks them EXPIRED.
- ✅ (phase 3) The event list includes seats left, using one `groupBy` query for the whole page (no N+1). A test with a 2-seat booking and an expired hold checks the list and the event page give the same number.

## Events API testing
- Tested manually with curl and the browser:
  - GET /events → 4 published upcoming events, sorted; drafts and cancelled hidden; no meetingLink
  - GET /events/:id → seatsLeft correct (28, and 0 for sold out); 404 for a fake id and for the draft
  - POST /events → 201 for valid data; 400 with field errors for invalid data; 400 for broken JSON
  - Unknown route → 404 JSON
- Automated tests moved to a separate ticket: needs Jest ESM setup, splitting app from listen, and a separate test database so tests don't touch dev data.

## API tests
- 5 tests (Jest + Supertest): /health; events list (published, upcoming, no meetingLink); event detail with seatsLeft; 404 for a missing event; POST invalid → 400 with field errors.
- Tests currently run against the dev database and only READ data (or fail validation before touching it).
- To do (follow-up ticket): separate Neon test branch + `.env.test` (and gitignore it); test for a valid POST → 201; draft → 404 test with its own test data.

## Known gaps
- ✅ Fixed in phase 2: POST /events took `organiserId` from the request body. The organiser now comes from the session, and Zod drops `organiserId` from the body (tested).
- ✅ Fixed in phase 2: POST /events was open to anyone. It now needs a logged-in organiser (`requireAuth` + `requireRole("ORGANISER")`).
- Open: `organiserId` is returned in public responses. Review what public endpoints should expose (privacy).
- Open: cover image is not yet required to publish (decision 007), because there's no image upload yet. Add the rule when uploads exist.

## Frontend testing (14 Nov 2026)
- Run: `npm test` in `web/` (Jest + React Testing Library, jsdom).
- Covered: price formatting (Free, £12, £8.50), time ranges in GMT and BST, category fallback,
  EventCard (title, venue, link, Online pill, Free, "Tomorrow").
- Not covered yet: async pages (list and detail) → Playwright end-to-end in phase 3.
- Accessibility: all 34 jsx-a11y recommended rules on; `npm run lint` passes.

## End-to-end and accessibility tests (22 Nov 2026)
- Run: `npm run test:e2e` in `web/` (Playwright, Chromium). It starts the local API and web
  app, or reuses ones already running. Needs the dev database with the seeded events.
- `e2e/browse.spec.ts`: open the first event on the list → its page shows the same title,
  the date and seats left; an unknown id shows "Event not found". Read-only.
- `e2e/a11y.spec.ts`: axe (WCAG 2.2 A + AA) on 9 pages, including the logged-in organiser
  pages and the "Discard changes?" dialog. No violations on 22 Nov. It signs up a throwaway
  `events-test-e2e-…` organiser; the API tests' cleanup deletes it.
- Manual keyboard pass (22 Nov): logical tab order, visible focus ring everywhere, skip link
  works, modal traps focus, closes on Escape and returns focus. Nothing to fix.
- Not in CI yet (phase 8). Automated axe checks find only part of the problems.

## Open questions
- **Vercel and `?limit=100` (20 Nov 2026), not explained yet.** `GET /api/v1/events?limit=100`
  through the Vercel rewrite (tix-book.vercel.app) returned events, but the same request to
  Render directly returned the correct 400 (limit must be 1–50). Possible causes to check:
  Vercel serving a cached response, the rewrite changing the query string, or an older API
  deploy behind the rewrite. To investigate: compare the response headers of both requests
  (cache headers, which deploy answered) and repeat it with a cache-busting parameter.