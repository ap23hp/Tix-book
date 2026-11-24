# Quality Notes

Testing approach, accessibility checks, known issues and things to review.

## Code quality tools
- **web/**: ESLint (from Next.js) + Prettier. Scripts: `lint`, `format`, `format:check`.
- **api/**: ESLint (typescript-eslint recommended) + Prettier. Scripts: `lint`, `format`, `format:check`, `build`.
- AGENTS.md is excluded from Prettier because `next dev` regenerates it.

## Database limits (Neon free plan)
- 100 CU-hours of compute per month, 0.5 GB storage, 5 GB transfer. Compute sleeps after 5 minutes idle.
- ✅ (phase 4) Risk avoided: a cron job querying the database every minute would keep it awake 24/7 (~180 CU-hours/month, over the limit). Hold expiry is lazy instead (decision 035): no scheduled queries.
- Keep `/health` free of database queries, so uptime monitoring doesn't wake the database.
- Phase 6 (estimate, to measure): pg-boss polls while the API is awake, so Neon stays awake
  too. The 3-hourly wake-up (decision 052) adds about 80 awake hours ≈ 20 CU-hours a month.
  `/health` itself still has no query, but waking the API now starts pg-boss.
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

## Payments testing (phase 5, 23 Nov 2026)
- API tests never call Stripe: every network call goes through `stripeGateway` (`api/src/lib/stripe.ts`), which the tests replace. Webhooks are signed with a test secret using Stripe's own `generateTestHeaderString`, so the real signature check runs.
- End-to-end: "Pay" really creates a test-mode session and reaches checkout.stripe.com; then the test sends the local API a correctly signed webhook (what `stripe listen` forwards). Skips without a webhook secret.
- Manual check (23 Nov): a real local payment with the 4242 test card through `stripe listen` confirmed the booking.
- Production payments haven't been tested by me (no data may be created in production); to check by hand: book a paid event on the live site and pay with the 4242 card.

## Email and jobs testing (phase 6, 23–24 Nov 2026)
- API tests never call Resend: a `FakeEmailSender` records messages. They use their own
  pg-boss schema (`pgboss_test`), so a test job can never be sent by a running local API.
- Covered: sandbox allowlist, escaping, no ticket JWT or meeting link in emails, London time
  on a UTC server in BST and GMT, the job saved in the booking's transaction (rollback leaves
  none), one job per confirmation even for duplicate webhooks, reminders (timing, skipped
  for refunded/cancelled/started, rescheduled when moved), retries → dead letter with a real
  worker, permanent errors skipping retries, redrive, and the circuit breaker (fake clock).
- Manual checks: one real email through Resend (`npm run email:test`, 23 Nov: delivered to
  the inbox, escaping shown as text); a free booking through the running dev API (worker
  logged `skipped: sandbox`, test data deleted).
- Known limits: sandbox mode (only the Resend account's address receives email), Resend's
  click-tracking links on `resend.dev` (decision 049), reminders arrive ~21–24 h before the
  event (decision 052). Nobody is alerted about dead-lettered jobs yet (phase 8).
- Not checked by me: production email sending and the scheduled wake-up (read-only rule);
  check by booking a free event on the live site as yourself, and with "Run workflow".
- Seed users (24 Nov, read-only check): the seed has never set a password for any user (every
  version in git history), password login refuses users without a password hash, and Google
  login requires `email_verified`, which an `example.com` address can't get. No password is
  in the repo or its history.

## Door scanner and check-in (#67, 24 Nov 2026)
- API: every scan answer (valid, already used, refunded/cancelled/held, wrong event,
  invalid/expired), the reference typed loosely, another organiser's reference, ownership
  404 / attendee 403, and 10 simultaneous scans of one ticket (exactly 1 valid). The race
  test warms up the connection pool first; without that it passed with the bug in.
- Web: a component test per result (words, inside the live region), empty code, 404, no
  camera, refused permission, a QR seen by a (mocked) camera sent once, the camera stopped
  on "Stop camera" and when the page is hidden (`<Activity>`).
- E2E: dashboard → scanner, paste the QR token → valid, the reference → already used,
  another organiser → 404, an attendee → "only organisers"; axe on the scanner page.
- Not tested automatically: a real camera reading a real QR code (jsdom and headless
  Chromium have no camera). To check by hand: open the scanner on a phone over HTTPS
  (a Vercel preview), scan a ticket from another screen.
- Flaky once in 5 full e2e runs: on a cold dev server with 4 workers, the scanner page took
  more than 15 s to compile on its first visit (still on the dashboard). Passed in the
  other runs; same cause as earlier cold-start notes.
- Not checked: the migration on production (read-only rule; it runs when the PR is merged).

## Open questions
- **Vercel and `?limit=100` (20 Nov 2026), not explained yet.** `GET /api/v1/events?limit=100`
  through the Vercel rewrite (tix-book.vercel.app) returned events, but the same request to
  Render directly returned the correct 400 (limit must be 1–50). Possible causes to check:
  Vercel serving a cached response, the rewrite changing the query string, or an older API
  deploy behind the rewrite. To investigate: compare the response headers of both requests
  (cache headers, which deploy answered) and repeat it with a cache-busting parameter.
- **One-off `fetch failed` in an e2e run (23 Nov 2026), not reproduced.** In the first cold
  run of phase 5b, the web server logged "Switched to client rendering because the server
  rendering errored: fetch failed" twice (a Server Component couldn't reach the local
  API). All 16 tests still passed. It did not happen in the next two cold runs (one on
  `main`, one on the branch). That run started seconds after I stopped a local API whose
  `tsx` child was still holding port 4000. To check if it happens again: which page, and
  whether the API had answered /health yet.
