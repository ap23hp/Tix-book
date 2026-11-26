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

## Ticket QR size (#71, 24 Nov 2026)
- Found in a real-phone test: the scanner only read the ticket QR when it was zoomed.
  Measured: 315-character JWT → QR version 13 (69 × 69), drawn at 176 px (~2.4 px/module).
- Now (Playwright): 384 px on a laptop, 292 px in the card and 358 px full screen on a
  390 px phone, with a 4-module quiet zone in the SVG. Decision 057 has the token options.
- Tests: the quiet zone and version 13 / error correction M (from the SVG's size), full
  width with no padding, full screen opens and closes, one image only; e2e measures the
  widths; axe runs on the full-screen dialog.
- Not tested automatically: a real phone camera reading a real phone screen (glare,
  brightness, distance). To check by hand (see the PR).
- ✅ (#73) The scanner asked the camera for no resolution (Chromium then gave 640 × 480).
  It now asks for 1920 × 1080 as an ideal (decision 058).

## Scanner camera resolution (#73, 24 Nov 2026)
- Tests: the constraints are exactly back camera + ideal 1920 × 1080 with no min, max or
  exact; `getSettings()` read and logged in development only; a fake camera that gives
  1280 × 720 still opens; the camera still stops on hide.
- Chromium fake camera: no size → 640 × 480, ideal → 1920 × 1080, impossible `min` →
  OverconstrainedError, impossible `ideal` → still opens.
- Not tested: a real phone camera (what size it gives, and whether 1080p detection is
  fast enough). To check by hand: see the PR.
- Flaky once again: `scan.spec.ts` failed in 1 of 3 full e2e runs (passed alone and in the
  next full run). It doesn't use the camera. The error text wasn't kept (my command cut
  the output), so the cause isn't confirmed; probably the cold-start compile noted above.

## Scanner on a phone (#75, 25 Nov 2026)
- Reproduced at 390 × 844 before the fix: camera view 611–953 px (68% on screen), result
  after a scan 985–1113 px (off screen). After: camera 334–676, result 692–820.
- E2E `scan-phone.spec.ts`: a **real camera scan**. Chromium's fake camera plays a video of
  the ticket's QR code, and the test checks the camera and the result are fully in the
  viewport, focus is on "Stop camera", axe passes at phone width with a result showing, and
  the paste-in box can still be reached.
- Unit: scroll on start (smooth / instant with reduced motion), the panel is what scrolls,
  focus stays on the same button, the result comes right after the video in the panel.
- Not tested: phones shorter than 844 px (the result is ~24 px from the bottom), and real
  phone browsers (only Chromium).

## Redis cache and rate limits (#77, 25 Nov 2026)
- Tests use an in-memory store (`MemoryStore`) and a fake clock; they never touch Redis, even
  when Upstash keys are in `.env` (`NODE_ENV=test` always picks memory).
- Cache (API, dev database): the second request comes from the cache; seats left changes
  after a booking without any invalidation (page and list); an API edit, back to draft, and a
  new event show at once; "not found" isn't cached; searches aren't cached; an event that
  started after caching is dropped; Redis down → still 200 from Postgres, edits still work;
  a poisoned cache (100 seats for a 1-seat event) doesn't let a booking through.
- Rate limits: each route's limit, Retry-After, another IP unaffected, the next window;
  login wait from 5 failures (from different IPs), doubling, capped at 15 minutes, cleared by
  success, forgotten after 24 h, the same for unknown emails; Redis down → still limited
  (memory) and still able to log in.
- Store: expiry, counters, the 10,000-key cap, the key prefix (dev ≠ production, no host in
  it), the circuit breaker (3 failures → not called, trial after 30 s).
- Breaking on purpose: 6 breaks, each failed a test (see LEARNING_LOG).
- Not tested automatically: the real Upstash store (to run by hand once keys exist); the
  "version read before the database" race (hard to time in a test); the right
  `TRUST_PROXY_HOPS` on Render (from the startup log after deploy).
- Local timing after (memory store, not Upstash): list and event page 40 → 23 ms median;
  search unchanged at ~43 ms (not cached).

## "[proxy]" log diagnostics (#79, 26 Nov 2026)
- The `[proxy]` lines didn't appear on Render after 9038a2e; cause not found in code
  (decision 066). Added an "armed" startup line and one "limit reached" line. Tests: the armed
  text, counts only (no address), N lines then ONE limit line then nothing, `/health` doesn't
  use up the count, and the real app logs on `/api` but not `/health`. Breaking on purpose
  (no limit line) failed a test.

## Rate limits off in production (#81, 26 Nov 2026)
- **Rate limits were off in production from #78 until this fix.** Every request on Render
  arrives on loopback (`[proxy] ... loopback=true`), and loopback was exempt by default
  (decision 067). Now exempt only with `RATE_LIMIT_EXEMPT_LOOPBACK=true`.
- Tests: only exactly `true` (trimmed) turns it on; without it a loopback connection gets
  429 after 10 logins; with it, it doesn't; the tests' setup file turns it on. Breaking on
  purpose (on unless "false") failed 2 tests.
- Not tested automatically: that limits really apply on Render after deploy (to check by
  hand, without writing to the production database).

## Test prefixes (#83, 26 Nov 2026)
- Prefix guard: finds every file's cleanup prefix and fails on any overlap. Breaking on
  purpose (putting `auth-test-ratelimit-` back) failed it and named the overlap.
- Proof: full `npm test` in parallel 3 times (07:47:04, 07:47:26, 07:47:47 UTC) and
  `--runInBand` once (07:48:08): 209/209 each time. Before the fix, 2 parallel runs out of 2
  failed 4 tests each.

## Open questions
- **`[proxy]` lines missing on Render (26 Nov 2026), cause not found** (decision 066).
  Also not explained: Render stayed awake from 06:05:39 to 06:22:01 UTC with no wake-api run.
- **wake-api schedule is irregular (seen 26 Nov 2026), not fixed yet.** Set for every 3 hours,
  it ran only 3 times in ~30 hours, at irregular times (25 Nov 02:22, 12:45, 23:36 GMT).
  GitHub's scheduled runs can be delayed or dropped. Risk: if Render is asleep, 24-hour
  reminder emails can be sent late or miss their window.
- **API tests clean up each other's data when run in parallel (seen 26 Nov 2026). Fixed in
  #83:** new prefixes `ratelimit-test-` and `cache-test-`, and `test-prefixes.test.ts` fails
  if a file's prefix is the start of another file's. `auth.test.ts` deletes every `auth-test-` user, which includes `rate-limit.test.ts`'s
  `auth-test-ratelimit-` user; `events.test.ts` deletes every `events-test-` user and event,
  which includes `event-cache.test.ts`'s `events-test-cache-` data. Two full `npm test` runs
  failed 4 tests each, in a different file each time (right password → 401; cache tests);
  `npm test -- --runInBand` passed 203/203. Fix: prefixes that don't start with another
  file's prefix.
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
