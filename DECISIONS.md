# Decisions

## 001 — ORM: Prisma
Date: 2 Nov 2026

**Options considered:** Prisma, Drizzle, TypeORM, plain SQL
**Decision:** Prisma
**Why:**

- small schema file, built-in migrations
- Type-safe client: TypeScript catches mistakes in queries
**Trade-off:** Prisma hides SQL and uses its own small schema language. Some queries (like row locking with SELECT ... FOR UPDATE in phase 4) will need raw SQL.
**Revisit if:** I end up writing raw SQL for most queries, or hit performance or connection problems I can't solve.

## 002 — Styling: Tailwind CSS, own components
Date: 2 Nov 2026

**Options considered:** Tailwind CSS, CSS Modules, a component library (MUI, shadcn/ui)
**Decision:** Tailwind CSS, with my own components (no component library)
**Why:**
- Works well with Next.js
- Building my own Button, Modal and seat picker shows frontend skill, including accessibility
**Trade-off:** Long class lists in JSX
**Revisit if:** Class lists become hard to read; then extract more components.

## 003 — Test runner: Jest
Date: 2 Nov 2026

**Options considered:** Jest, Vitest
**Decision:** Jest
**Why:**
- I've used Jest before
- Test syntax is almost the same in both, so the skills transfer
**Trade-off:** Jest needs extra setup to work with TypeScript.
**Revisit if:** The Jest + TypeScript setup becomes painful; Vitest is a quick switch.
## 004 — Tickets: one booking = one ticket (no separate tickets table)
Date: 2 Nov 2026

**Options considered:** Separate Ticket table (one row per seat) vs using the Booking itself as the ticket
**Decision:** A confirmed booking is the ticket. One booking reference and one QR code per booking, whatever the number of seats.
**Why:**
- Everything the ticket screen shows (event, seats, paid, status, reference) is already on the booking
- Two tables with the same data would need updating in two places, and could go out of sync
- Matches the wireframes: one QR for a 2-seat booking
**Trade-off:** People in the same booking can't be checked in separately at the door.
**Revisit if:** I add per-seat tickets or door check-in (listed under Later).

## 005 — Seats left: calculated, not stored
Date: 2 Nov 2026

**Options considered:** A `seatsLeft` counter column vs calculating from bookings
**Decision:** Store only `seatLimit`. Seats left = seatLimit − seats in HELD and CONFIRMED bookings.
**Why:** A counter can go out of sync (e.g. the booking saves but the counter update fails), which could oversell seats. Calculating always matches the real bookings. Correct first, fast later.
**Trade-off:** An extra count query each time seats left is needed.
**Revisit if:** It becomes slow; fix with indexes or caching.

## 006 — Money stored as integer pence
Date: 2 Nov 2026

**Options considered:** Decimal pounds (12.50) vs integer pence (1250)
**Decision:** Integer pence, in a field named `pricePence`. 0 = free.
**Why:**
- Decimals in JavaScript aren't exact (0.1 + 0.2 = 0.30000000000000004)
- Integers avoid rounding errors in totals and refunds
- Stripe also uses the smallest currency unit, so no conversion needed
**Trade-off:** Must divide by 100 whenever displaying a price.
**Revisit if:** Multiple currencies with different smallest units are needed.

## 007 — Conditional rules: nullable in the database, enforced by the app
Date: 2 Nov 2026

**Decision:** Fields that are only required in some cases are nullable in the database, and the API enforces the rule:
- `venueName`, `venueAddress`, `doorsAt`: required only for IN_PERSON events
- `meetingLink`: required only to publish an ONLINE event
- `coverImageUrl`: optional for drafts, required to publish
- Only users with role ORGANISER can create events
**Why:**
- A database column can't say "required only sometimes", and a foreign key can't check another table's column (like role)
- Drafts can be saved unfinished: save now, complete later
**Trade-off:** The rules live in code, so they need tests to make sure they're enforced.
**Revisit if:** The same rule is needed in many places; move it into one shared validation function.

## 008 — Hold expiry: store the end time
Date: 2 Nov 2026

**Options considered:** Store when the hold started vs when it expires
**Decision:** `holdExpiresAt` on the booking (now + 5 minutes, set by the server). Nullable, because free bookings skip the hold.
**Why:**
- The cron job's query is simple: status = HELD and holdExpiresAt < now
- The frontend countdown uses the server's time, not a local 5:00
**Trade-off:** Each hold’s end time is fixed when it’s created.
**Revisit if:** Hold length needs to vary per event.

## 009 — Booking stores price per seat at time of booking
Date: 2 Nov 2026

**Options considered:** Read the price from the event vs store it on the booking
**Decision:** `unitPricePence` on the booking. Total = unitPricePence × seats (calculated).
**Why:**
- Organisers can change the event price later; existing bookings must keep the price they paid
- Total is calculated, not stored, so it can't go out of sync (same idea as decision 005)
**Trade-off:** The price exists in two places (event's current price, booking's paid price), but they mean different things.
**Revisit if:** Booking fees or discounts are added; then store totalPence as well.

## 010 — Idempotency key on bookings
Date: 2 Nov 2026

**Decision:** The frontend creates a UUID when the seat sheet opens and sends it with every "hold seats" request. The booking stores it in `idempotencyKey` with a unique constraint.
**Why:**
- Double taps, slow networks and retries could create two bookings
- The unique constraint makes the database reject duplicates, even if both requests arrive at the same moment
- The server returns the existing booking, so the user sees one booking, no error
**Trade-off:** Extra column and handling in the API.
**Revisit if:** Other actions (like payment) also need protection from repeats.

## 011 — Database region: Frankfurt
Date: 4 Nov 2026

**Options considered:** Neon London vs Neon Frankfurt
**Decision:** Frankfurt (AWS Europe Central 1)
**Why:**
- Render (API host) has no London region; its only European region is Frankfurt
- The API talks to the database many times per request; users talk to the API once. So the database goes next to the API, not next to the users
**Trade-off:** Users in London are slightly further from the API than they would be with a London host.
**Revisit if:** The API moves to a host with a London region.

## 012 — Database connection: sslmode=verify-full
Date: 5 Nov 2026

**Options considered:** sslmode=require vs sslmode=verify-full
**Decision:** verify-full, in both .env and .env.example
**Why:**
- Encrypts the connection AND verifies the server's certificate, protecting against man-in-the-middle attacks
- The pg package warned that `require` will become weaker in a future version; being explicit keeps it strict
**Trade-off:** If the certificate can't be verified (e.g. an unusual network setup), the connection fails instead of falling back to a weaker mode. That's the safe behaviour.
**Revisit if:** A hosting platform needs a different SSL setting.
## 013 — API hosting: Render free plan, database on Neon
Date: 6 Nov 2026
 
**Options considered:** Render (long-running server), Vercel Functions (serverless), Fly.io, Railway, Koyeb
**Decision:** Express API on Render's free web service; PostgreSQL on Neon's free plan
**Why:**
- A long-running server suits the work coming in later phases: releasing expired seat holds, scheduled reminders, job queues
- Fly.io, Railway and Koyeb have no free compute for new accounts
- Neon's free plan is permanent (Render's free Postgres expires)
**Trade-off:** Render's free service sleeps after 15 minutes without traffic and takes about a minute to wake. The frontend handles this with a timeout and a "server may be waking up" Retry screen (decision 017).
**Revisit if:** Real users arrive and the cold start hurts them; a small paid plan removes it.
## 014 — POST /api/v1/events stays open until auth
Date: 6 Nov 2026
 
**Options considered:** Add a temporary restriction now (API key, disable the route) vs leave it open until phase 2
**Decision:** Leave it open. `organiserId` in the request body is a temporary stand-in for the logged-in user.
**Why:**
- Phase 2 replaces this with real authentication and roles; a temporary lock would be thrown away
- Zod validation and the organiser-role check still reject bad input
**Trade-off:** Anyone who finds the API URL can create events (hiding the URL is not protection). Accepted because there are no real users yet.
**Revisit if:** The app is shared with real users before phase 2 is done.
## 015 — Frontend fetches data in Server Components
Date: 13 Nov 2026
 
**Options considered:** Server Components fetching on the server vs Client Components fetching in the browser (useEffect, or a library like TanStack Query)
**Decision:** Pages are Server Components that call the API on the server through a typed `fetchJson<T>()` helper. Only interactive parts will be Client Components.
**Why:**
- The API URL lives in a server-only environment variable (`API_URL`, no `NEXT_PUBLIC_` prefix), so the browser never calls Render directly and no CORS setup is needed
- Less JavaScript is sent to the browser; no loading flicker from useEffect
- One generic helper gives typed results everywhere
**Trade-off:** The response type is trusted (`as Promise<T>`), not checked at runtime. Every page view goes through the Next.js server.
**Revisit if:** The API response shape changes often; then validate responses with Zod.
## 016 — Keep Cache Components and Partial Prefetching (Next.js 16.4 defaults)
Date: 13 Nov 2026
 
**Options considered:** Keep the defaults `create-next-app` added vs turn them off
**Decision:** Keep `cacheComponents: true` and `partialPrefetching: true`
**Why:**
- Pages are partially prerendered: a static shell (header, title, skeletons) is sent instantly and event data streams in inside `<Suspense>`
- Partial Prefetching prefetches one reusable shell per route before a link is clicked
- Next.js plans to make these the default in the next major version
**Trade-off:** Stricter rules: uncached data must be inside `<Suspense>`, and the current time needs `await connection()` first (used for the "in X days" label).
**Revisit if:** These rules block a feature I need.
## 017 — 10-second fetch timeout and a Retry screen for the cold start
Date: 13 Nov 2026
 
**Options considered:** No timeout (wait for Render to wake) vs a short timeout plus an error page with Retry
**Decision:** `AbortSignal.timeout(10_000)` on every API call. On failure, `error.tsx` shows "The server may be waking up" with a Retry button that calls `retry()`.
**Why:**
- Without a timeout, a visitor could stare at a loading skeleton for a minute with no explanation
- The first request still wakes Render, so Retry usually works a few seconds later
- `retry()` re-fetches Server Component data; `reset()` would only re-render the same error (checked in the Next.js 16.4.4 docs)
**Trade-off:** A slow but working API (over 10 seconds) is treated as an error.
**Revisit if:** The API moves off a sleeping free plan.
## 018 — Frontend hosting: Vercel
Date: 13 Nov 2026
 
**Options considered:** Vercel, Netlify, Render (a second service)
**Decision:** Vercel Hobby, with the project's Root Directory set to `web`
**Why:**
- Built by the Next.js team, so Next.js features work without extra setup
- Every pushed branch gets its own Preview deployment; `main` deploys to Production
- Render's free plan allows only one free service, already used by the API
**Trade-off:** The Hobby plan is for personal, non-commercial use. Preview deployments need a Vercel login to view.
**Revisit if:** The project becomes commercial.
## 019 — Separate databases for development and production (Neon branches)
Date: 13 Nov 2026 (decided), 14 Nov 2026 (done)

**Options considered:** One shared database vs a Neon branch for dev vs a second Neon project
**Decision:** A Neon branch called `dev`, copied from the `production` branch. Render uses
`production`; my laptop's `api/.env` uses `dev`. Auto-delete is off for `dev`.
**Why:**
- Running the seed or `migrate dev` locally could change or wipe live data (it happened on 6 Nov)
- A branch starts as an exact copy of production (schema and data), so dev looks like the real thing
- Free plan allows 10 branches per project; a branch has its own connection string and compute
- `dev` can be reset from its parent if it gets messy
**Trade-off:** Both branches share the project's monthly compute allowance. Dev data drifts from
production over time.
**Revisit if:** I need a separate test database for automated tests (next: a Neon test branch).

## 020 — Seed safety: one transaction + an allowed-host guard
Date: 14 Nov 2026

**Options considered:** No protection; a "are you sure?" prompt; a NODE_ENV check;
an allowed-host check
**Decision:** The seed runs inside one interactive transaction, and refuses to start unless
the DATABASE_URL host equals SEED_ALLOWED_HOST (set to the Neon dev host in api/.env).
**Why:**
- On 6 Nov the seed crashed halfway and left the database empty; a transaction rolls back
  every step on failure
- A prompt can be clicked through, and NODE_ENV isn't set reliably on every machine;
  comparing the actual host checks the thing that matters: which database is about to be wiped
**Trade-off:** One more env var to set up on a new machine. Longer transaction limits
(maxWait 10s, timeout 20s) are fine for a one-off dev script, not for app code.
**Revisit if:** A test database needs seeding too; then allow a list of hosts.
## 021 — Frontend testing: Jest + React Testing Library; async pages tested end-to-end
Date: 14 Nov 2026

**Options considered:** Jest vs Vitest for the frontend; unit-testing the pages vs end-to-end
**Decision:** Jest + React Testing Library in `web/` (same runner as the API, decision 003).
Unit tests for `lib/format.ts`, component tests for `EventCard`. The async pages
(`app/page.tsx`, `app/events/[id]/page.tsx`) will be tested end-to-end with Playwright in phase 3.
**Why:**
- The Next.js docs (16.4.4) say Jest doesn't support async Server Components and recommend
  end-to-end tests for them; sync components and helpers can be unit tested
- `next/jest` configures the compiler, CSS and `next/font` mocks automatically
**Trade-off:** Until phase 3, the pages' data loading isn't covered by automated tests.
**Revisit if:** Jest gains support for async Server Components.

## 022 — Phase 1 scope changes: create-event form → phase 2, Lighthouse → phase 7
Date: 14 Nov 2026

**Decision:** The create-event form moves to phase 2; the first Lighthouse run moves to phase 7.
**Why:**
- `POST /api/v1/events` has no login yet (decision 014). A public form on the live site would let
  anyone create events with one click. It belongs behind organiser login.
- Lighthouse measures performance, which is phase 7's focus; measuring then gives before/after numbers.
**Trade-off:** Phase 1 ships without a way to create events from the UI (seed and API only).
**Revisit if:** Never needed; both are scheduled.

## 023: Auth approach (phase 2)
**Date:** 15 Nov 2026
**Decision:** Build email/password auth myself with database sessions (httpOnly cookie, session table in Postgres). Use Arctic only for the Google OAuth flow. Use a signed JWT later for ticket QR codes (phase 5).
**Options considered:**
- A. Build sessions myself (chosen)
- B. Better Auth (the most common library choice for new TypeScript projects in 2026)
- C. Clerk or Auth0 (managed services)
- JWT for login
**Why:**
- The project's goal is learning by building, and UK job ads test whether I understand OAuth, sessions and JWT, not a specific library.
- Sessions give instant logout and revocation. A JWT for login can't be revoked without adding server-side state, which removes its main benefit.
- A JWT fits tickets: a signed claim that a scanner can verify without the database.
**Trade-off:** More security risk and time than a library. At a company I'd use Better Auth or Auth0, because auth isn't the product.
**Cookies:** Vercel rewrites `/api/*` to Render, so the browser only talks to vercel.app and the cookie is first-party. This avoids Safari blocking cross-site cookies.

## 024: Password hashing
**Date:** 15 Nov 2026
**Decision:** Argon2id via the `argon2` npm package, OWASP minimum settings (19 MiB, 2 iterations, 1 thread).
**Options considered:** Argon2id (chosen), scrypt (built into Node, no extra package), bcrypt (older, limited to 72 bytes).
**Why:** OWASP's first choice for new systems. Minimum settings because Render's free plan has little memory.
**Trade-off:** A native package (prebuilt binaries) instead of zero dependencies with scrypt.
## 025: Who can be an organiser
**Date:** 15 Nov 2026
**Decision:** Anyone can choose ATTENDEE or ORGANISER at sign-up (default ATTENDEE).
**Options considered:** open choice (chosen); everyone starts as ATTENDEE and an admin promotes organisers.
**Why:** Simple, and fits running my own free coding sessions as an organiser. The API still checks the role on every protected route.
**Trade-off:** Anyone can publish events. If that becomes a problem, switch to admin promotion.

## 026 — Header gets the logged-in user on the server
Date: 2026-11-15
Options: (1) Server Component reads the cookie and calls /me with it
         (2) Client Component calls /me from the browser after load
Chose: 1
Why: The header arrives already showing the right state, with no "Log in" flash before
"Hi, name". The session check stays on the server. Cost: the header needs its own
<Suspense> (Cache Components rule), and Next makes one extra API call per page.
## 027 — Google login: authorization code flow + PKCE, in the API
Date: 2026-11-17
Options: (1) Code flow in our Express API with Arctic
         (2) Google's "Sign in with Google" button (ID token verified by the API)
         (3) Auth library (Better Auth / Auth.js)
         (4) Managed provider (Auth0, Clerk, Cognito)
Chose: 1
Why: Teaches the full flow (state, PKCE, code exchange). After Google, it creates the
same session as password login, so /me, roles and logout don't change. The callback
goes through the Vercel rewrite, so the session cookie stays first-party.
Trade-off: more code and security details to own. In a company I'd likely use a
managed provider or library.

## 028 — Don't auto-link Google to an existing password account
Date: 2026-11-17
Problem: we don't verify emails at sign-up. If someone signed up with your email and a
password, linking your Google login to that account would let them keep access
(pre-account hijacking).
Chose: if the email already has a password (or a different Google account), refuse
and show "Log in with your email and password". Link only accounts with neither
(e.g. seeded users). New Google users are ATTENDEE.
Later: email verification would make safe linking possible.

## 029 — CORS and CSRF
Date: 2026-11-17
CORS: no CORS middleware. The browser only calls tix-book.vercel.app (rewrite to
Render), so requests are same-origin; Next.js → Render is server-to-server. Not
adding CORS headers means other sites' JavaScript can't read our API's responses.
CSRF: no CSRF token. Protection = SameSite=Lax session cookie + JSON-only bodies +
GET never changes data + `state` on the Google callback. Defence in depth:
middleware rejects POST/PUT/PATCH/DELETE when Sec-Fetch-Site is cross-site or
same-site (Fetch Metadata). Requests without the header (non-browsers) are allowed.
Trade-off: very old browsers don't send Sec-Fetch-Site; they still get SameSite.

## 030 — Cursor pagination for the event list
Date: 2026-11-17
Options: (1) Offset (?page=2 → skip/take)  (2) Cursor (?cursor=<last seen>)
Chose: 2, keyset on (startsAt, id), opaque base64url cursor, "Load more" in the UI
Why: stable when events are added or removed (no duplicates or gaps), stays fast on big
tables, fits the month-grouped list. Response: { events, nextCursor }.
Trade-off: no "jump to page 5"; slightly more logic. An index on (status, startsAt, id)
will help in phase 7.

## 031 — Client state for toasts: React Context, no state library
Date: 2026-11-18
Options: (1) None: pass a toast function down through props
         (2) React Context + useState
         (3) Zustand (small global store, no provider)
Chose: 2. `ToastProvider` in the root layout keeps the list of toasts in its own
useState. The context holds only the `toast()` function, made once with
`useCallback(..., [])`, so it never changes.
Why:
- Any component, at any depth, needs to show a toast; passing a function through
  every layer (option 1) doesn't scale.
- Context's usual cost is that every component reading it re-renders when its value
  changes. Here the value never changes, so callers never re-render. A test checks
  this, and fails if the function is re-created.
- Built into React: no new package for one small piece of state.
- The root layout stays mounted across navigations, so a toast shown just before
  `router.push()` is still there on the next page.
- Most of the app's data is server state (events, bookings), fetched in Server
  Components (decision 015). That isn't a job for a client store.
Trade-off: the provider has to wrap the app, and `useToast()` throws outside it.
Zustand would avoid the provider and let components pick just the part they need.
Revisit if: several unrelated pieces of client state need sharing across pages
(e.g. a seat picker plus a basket), or Context re-renders show up as slow.

## 032 — Another organiser's event: 404, not 403
Date: 2026-11-22
Options: (1) 403 "You don't have permission"  (2) 404 "Event not found"
Chose: 2. `GET /api/v1/events/mine/:id` and `PATCH /api/v1/events/:id` give an
unknown id and someone else's event exactly the same 404 response. One shared
function, `findOwnEvent`, does the check for every "my event" route.
Why:
- A 403 admits "this event exists, it just isn't yours". For drafts that is a leak:
  nobody else should know they exist. The public GET /:id already treats drafts as
  404 (it doesn't reveal hidden events), so this matches.
- One answer for "missing" and "not yours" means the API never confirms whether an
  id exists. GitHub does the same for private repositories.
- Ownership is checked before validation, so another organiser doesn't even get a
  400 that would show our rules for someone else's event.
- Defence in depth: the update itself also filters on `organiserId`, so a bug in the
  check still couldn't change another organiser's row.
Trade-off: 403 is more precise and easier to debug ("not allowed" is clearer than
"doesn't exist"), and for published events, which anyone can see, the 404 hides
nothing. Logs on our side can still record the real reason if needed.
Revisit if: organisers can share events with co-organisers (then "you can see it but
can't edit it" becomes a real case, and 403 fits it).

## 033 — "My tickets" moves from phase 3 to phase 4
Date: 2026-11-22
Options: (1) an empty "My tickets" page now (2) build it in phase 4, with bookings
Chose: 2
Why:
- Nobody can book until phase 4, so the page could only ever say "no tickets yet".
  A link to a page that can never show anything makes the app look unfinished.
- What the page shows (booking reference, status, seats, QR code) is decided by the
  booking work in phase 4; an empty state built now would be rewritten then.
Trade-off: phase 3 ends without the attendee's side of "my pages"; attendees have
nothing of their own to see until booking exists. Issue #35 and PLAN.md are updated.
Revisit if: never needed; it's scheduled in phase 4.
## 034 — Preventing double booking: lock the event row (pessimistic)
Date: 2026-11-22
Options: (1) pessimistic: `SELECT ... FOR UPDATE` on the event row, then count and insert
         (2) optimistic: no lock; check a version at save time and retry on conflict
         (3) a database constraint alone (can't express "sum of seats ≤ seatLimit")
         (4) a stored seats-left counter updated atomically (rejected in decision 005)
Chose: 1. One transaction per booking: lock the event row, mark its expired holds
EXPIRED, count taken seats with the shared rule (`lib/seats.ts`), then create the
booking or answer 409.
Why:
- Everyone booking an event fights over the same row (high contention). With a lock,
  requests simply queue for milliseconds; with optimistic locking most of them would
  fail and retry (measured in phase 4b).
- Easy to reason about: inside the lock, the count can't change.
- Tested: 20 simultaneous requests for 5 seats → exactly 5 succeed. With `FOR UPDATE`
  removed, 10 seats were sold for 5 places.
Trade-off: raw SQL (Prisma has no FOR UPDATE), and bookings for one event run one at a
time. Each holds a connection while it waits, so transactions get 10s instead of
Prisma's 2s/5s defaults. Confirming a hold takes the same lock and reads the clock
after getting it, so a confirm at the moment a hold expires can't race a new booking.
Revisit if: one event gets so many bookings per second that the queue is slow (then a
queue or seat-level rows).

## 035 — Expired holds without a cron job
Date: 2026-11-22
Options: (1) a cron job every minute that marks expired holds EXPIRED
         (2) an in-process timer (setInterval) in the API
         (3) lazy expiry: decide by time when reading, save the status on the way
Chose: 3. Correctness never depends on the stored status: seats left already ignores
holds whose `holdExpiresAt` has passed (decision 005 rule, `takenWhere`). The status is
saved as EXPIRED whenever a booking is made for that event, a booking is read, a list is
read, or a confirm fails.
Why:
- Render's free plan sleeps after 15 minutes, so an in-process timer stops exactly when
  nobody is around, and an external cron would need a secret in Render.
- A cron querying every minute would keep Neon awake 24/7 (~180 compute hours/month, over
  the free limit, see QUALITY_NOTES).
- Nothing waits on a status change: there are no "hold expired" emails until phase 6.
Trade-off: a stored HELD row can stay HELD long after it ran out, so raw database counts
must use the same rule (`takenWhere`) or the API, never `status = 'HELD'` alone.
Revisit if: phase 6 sends "your hold expired" emails (then a scheduled job is needed).

## 036 — Confirming a hold before payments exist; free events skip the hold
Date: 2026-11-22
Options: (1) wait for Stripe (phase 5) before any booking can be confirmed
         (2) `POST /api/v1/bookings/:id/confirm` as a stand-in for "payment succeeded"
Chose: 2, plus: free events are CONFIRMED straight away (decision 008).
Why: phase 4 can be finished and tested end to end (hold → confirm → ticket), and phase 5
only has to replace what triggers the confirm (the Stripe webhook) without changing the
rules: same lock, same expiry check.
Trade-off: until phase 5, anyone can "pay" for a paid event by pressing Confirm. This is a
demo app with no real money, so that's acceptable, and it's stated in the UI.
Revisit if: phase 5 (Stripe) is built; this endpoint then goes away or becomes
organiser-only.
**Done (phase 5b, 23 Nov):** the endpoint is removed; only the signed Stripe webhook confirms a
booking (decisions 041, 042).

## 037 — Who can book, and how many seats
Date: 2026-11-22
Chose: any logged-in user (attendee or organiser) can book a published event that hasn't
started, 1 to 10 seats per booking, no limit on bookings per person.
Why: organisers go to other people's events too, and a per-person limit is a business
rule nobody has asked for yet. 10 seats stops one request from taking a whole event by
mistake.
Trade-off: one person could still hold many seats with several bookings (each held for 5
minutes); a scalper protection would need limits per user or per event.
Revisit if: abuse appears, or organisers ask for "max N tickets per person".

## 038 — Locking, measured: keep pessimistic (row lock)
Date: 2026-11-22
Options: (1) pessimistic: `SELECT ... FOR UPDATE` on the event row (decision 034)
         (2) optimistic: read a version without locking, save only if it's unchanged,
             retry with a short random wait on a conflict (`src/lab/optimistic-booking.ts`)
Measured (`npm run lab:locking`, 40 simultaneous 1-seat bookings, 3 rounds each, my laptop
→ Neon Frankfurt):
| Scenario | Pessimistic | Optimistic |
|---|---|---|
| Mostly sold out (10 seats) | ~2.5 s, 0 retries | ~1.9 s, 7 retries |
| Room for everyone (40 seats) | ~3.1 s, 0 retries | ~5.9 s, ~260 retries (6.5 per booking) |
Both were correct in every round: no overselling, no errors.
Chose: 1, keep the row lock.
Why:
- Optimistic only wins when most requests are refused early (they read "sold out" and stop,
  while with a lock even the refused ones queue). When many people succeed at once, each
  success invalidates everyone else's read, so retries snowball: nearly 2x slower and ~260
  wasted attempts for 40 bookings.
- A popular event going on sale is exactly "many successes at once".
- No retry limit to tune, and no "too busy, try again" (503) when retries run out.
Trade-off: refused requests wait in the lock queue too. The experiment used the event's
`updatedAt` as the version (no schema change); adopting optimistic for real would need an
integer `version` column.
Revisit if: measured on Render next to the database (lower latency changes the numbers), or
if one event's lock queue becomes the bottleneck.

Deadlocks: caused on purpose in `locking-lab.test.ts`: two transactions locking two events in
opposite order → Postgres cancels one with error 40P01 ("deadlock detected"). The booking API
can't deadlock this way because each booking locks exactly one event row; if a future feature
locks several (a basket), it must lock them in a fixed order (sorted ids), which the second
test shows avoids it.

## 039 — The booking flow: a page per booking, not only a dialog
Date: 2026-11-23
Options: (1) do everything in the dialog on the event page (hold, countdown, confirm)
         (2) the dialog only chooses seats; the hold lives on its own page `/bookings/[id]`
Chose: 2.
Why:
- A hold lasts 5 minutes: a refresh, the back button or a closed tab must not lose it.
  With its own URL the booking can always be found again (and "My tickets" links to it).
- The countdown starts from the server's time (`serverTime` in the response, decision
  008), so reopening the page shows the right time left, not a fresh 5:00.
- The confirmed booking is the ticket (decision 004), which needs a page anyway.
Details: the idempotency key is made when the dialog opens and reused for every try from
that dialog (decision 010). Dates on the booking page are formatted on the server only.
Trade-off: one more page and a navigation between choosing seats and confirming.
Revisit if: payments (phase 5) move confirmation to Stripe's checkout page.

## 040 — My tickets: every booking, newest first
Date: 2026-11-23
Options: (1) only confirmed bookings (the "real" tickets)
         (2) every booking with its status (held, confirmed, expired), newest first
Chose: 2, up to 50 (the API's limit), expired and cancelled ones dimmed.
Why:
- A running hold must be easy to find again (the countdown is still going), and an
  expired hold explains itself ("why don't I have a ticket?").
- Newest first matches what people look for: the thing they just booked.
- Everyone gets the "My tickets" link, because anyone can book (decision 037).
Trade-off: the list grows with every expired hold; it isn't grouped into upcoming and past
events yet, and there's no paging past 50.
Revisit if: people keep many bookings (then split upcoming/past and add cursor paging, like
the event list).

## 041 — Paying after the hold has run out
Date: 2026-11-22
Problem: a hold lasts 5 minutes (decision 008), but a Stripe Checkout Session must stay
open for at least 30 minutes. Someone can pay on Stripe's page after their seats were
released, maybe to someone else.
Options: (1) make the hold 30 minutes once checkout starts
         (2) keep 5 minutes; when a payment arrives late, check again under the event lock:
             seats still free → confirm, seats gone → refund automatically
         (3) keep 5 minutes and expire the Stripe session through the API when the hold ends
Chose: 2. The webhook takes the same event row lock as booking (decision 034), so it can't
race a new booking for the same seats. The refund is made after the transaction (never
hold a lock while waiting for Stripe), with the payment's id as the idempotency key.
Why:
- 1 blocks seats 6 times longer for people who may never pay, which hurts popular events
  exactly when it matters.
- 3 needs something to run when the hold ends: a timer or cron, which Render's free plan
  can't do reliably (decision 035). And it still races a payment already in flight.
- Most late payments are a few seconds late, with seats still free: confirming them is
  what the customer expects.
Also refunded: a second payment for a booking that is already paid (two Stripe tabs), and
a payment for an event that was cancelled or has started.
Trade-off: a customer can occasionally be charged and refunded (the refund takes days to
reach their account), and Stripe keeps its fee on a refunded payment.
Revisit if: refunds happen often (then show a clear warning when less than a minute of
the hold is left, or extend the hold once while on Stripe's page).

## 042 — Handling the same webhook more than once
Date: 2026-11-22
Stripe says an event can arrive more than once and in any order.
Options: (1) a table of handled event ids only
         (2) only conditional updates (change the booking only from the expected state)
         (3) both
Chose: 3. `StripeEvent` stores the id (`evt_...`) after the work succeeded, so a repeat is
skipped straight away. But two copies can arrive at the same moment, before either is
recorded, and different events can describe the same payment (`completed` and
`async_payment_succeeded`). So the booking also stores the payment's id: under the lock,
"this payment is already on the booking" means it's done.
Why: the event table is the fast path; the payment id under the lock is what is actually
safe. Breaking the payment-id check on purpose failed the "two copies at once" test even
though the event table was still there.
The id is recorded only after the work succeeds: if anything throws (e.g. the refund call
times out), we answer 500, Stripe retries with backoff, and the work runs again. Every
step is safe to repeat.
Trade-off: one more table that grows by one row per webhook (tiny; can be cleaned after
30 days, as Stripe stops retrying after 3).

## 043 — Calling Stripe: timeouts, retries and a swap-in point for tests
Date: 2026-11-22
Chose:
- Stripe client timeout 10 s (default 80 s) and 2 network retries (default 1). The user is
  waiting after pressing "Pay"; 80 s is longer than anyone waits. The SDK adds an
  idempotency key to retried POSTs, so a retry can't create a second session.
- Every network call to Stripe lives in one object (`stripeGateway` in `lib/stripe.ts`).
  Tests replace its functions, so the suite never calls Stripe and runs without keys.
  Signature checks are NOT replaced: tests sign webhooks with Stripe's own
  `generateTestHeaderString`, so the real verification runs.
Options for tests: (1) Jest module mocks (2) Stripe's test API over the network
(3) a small object to swap
Why 3: Jest module mocks with ESM need `unstable_mockModule` and dynamic imports in every
test file; real Stripe calls would make tests slow, flaky and need a secret in CI.
Trade-off: the fake returns only the fields we use, so a change in Stripe's response shape
wouldn't be caught by unit tests (the end-to-end check with Stripe's test mode covers that).

## 044 — After paying: one booking page that waits for the webhook
Date: 2026-11-23
Options: (1) separate /payment/success and /payment/failed pages
         (2) the booking page itself, with Stripe adding ?payment=success|cancelled
Chose: 2. The booking page already shows every state (held, confirmed, expired), so
"refunded", "cancelled" and "confirming" are just more states of the same thing.
Never trust the redirect: ?payment=success only means "the browser came back". Until the
API says the booking changed, the page shows "Payment received. Confirming your booking…"
and asks GET /bookings/:id every 2 s, up to 20 times, then shows a calm "taking longer"
message with a link to My tickets.
Options for waiting: polling (chosen), Server-Sent Events, WebSockets.
Why polling: it's one short wait per payment (Stripe usually delivers the webhook before
the redirect, so most people never see it), it needs nothing on the server, and Render's
free plan sleeps and drops long-lived connections. The next request is scheduled only
after the last answer (no overlapping requests), and the effect cleanup cancels both the
timer and the request when the page is left or hidden.
"Failed payment" has no page of its own: a declined card stays on Stripe's page (the user
can try another card), and a slow payment that fails just lets the hold run out.
Trade-off: up to 20 small requests per payment in the worst case.
Revisit if: something else needs live updates (e.g. a live seat counter in phase 7); then
SSE could serve both.

## 045 — Testing payments end to end without driving Stripe's page
Date: 2026-11-23
Options: (1) fill in Stripe's hosted checkout in Playwright
         (2) click "Pay", check we really reach checkout.stripe.com, then send the local API
             the same signed webhook Stripe sends (what `stripe listen` forwards)
         (3) mock the API's Stripe calls in end-to-end tests too
Chose: 2. The test reads STRIPE_WEBHOOK_SECRET from api/.env inside the test process and
signs the event itself (HMAC-SHA256 of "timestamp.body"). The API's real signature check
runs. Without a secret, the payment parts skip instead of failing.
Why: Stripe's page is someone else's UI, inside iframes, and can change at any time; tests
on it would be slow and flaky. Option 3 would stop testing the real checkout session.
I paid once by hand with the 4242 test card through `stripe listen` (23 Nov), and the real
webhook confirmed the booking, which covers what the test skips.
Trade-off: the e2e webhook payload only has the fields we read; if Stripe changed the event
shape, only the manual check would notice.

## 046 — Tickets: a signed JWT, checked against the database at the door
Date: 2026-11-23
Decision 023 chose a signed JWT for ticket QR codes. The details:
- **What's inside:** booking id (`sub`), reference, event id, seats, issuer `tixbook`,
  audience `ticket`, issued-at and expiry. No names or emails: anyone can decode a JWT
  without the secret (it's only base64).
- **Signing:** HS256 (HMAC-SHA256) with `TICKET_JWT_SECRET`, a different value locally and
  on Render, separate from everything else. Library: `jose`.
- **Expiry:** a day after the event ends, so an old ticket can't be reused.
- **Verifying:** only HS256 is accepted (no "alg: none" or algorithm switching), and the
  issuer and audience must match, so a token signed for another purpose with the same
  secret can't be used as a ticket.
- **The door check also asks the database** (`POST /api/v1/tickets/verify`, the event's
  organiser only): the booking must still be CONFIRMED.
Options for revocation: (1) trust the signature alone (works offline)
                         (2) signature, then the database (chosen)
                         (3) a list of revoked token ids
Why 2: a JWT can't be taken back. A ticket for a booking that was refunded afterwards
(decision 041) still has a valid signature. The signature check still matters: forged or
edited tickets are refused before any database work, and a scanner with no connection
could fall back to the signature alone.
Trade-off: the door check needs the API to be up. HS256 means the same secret signs and
verifies, so an offline scanner would need the secret; with public-key signing (ES256),
scanners could verify without being able to make tickets.
Revisit if: offline scanning is needed (switch to ES256 and give scanners the public key).

## 047 — The QR code is made on the server
Date: 2026-11-23
Options: (1) send the token to the browser and draw the QR there (e.g. qrcode.react)
         (2) make an SVG on the server and send it as an <img> data URL
Chose: 2. The booking page is already a Server Component that fetches the booking; it
fetches the token the same way and turns it into an SVG with `qrcode`. No QR library is
sent to the browser, and the image has alt text with the reference.
Details: error correction "M" (still scans with about 15% damaged, e.g. a cracked screen),
and a white background even in dark mode, because scanners need the contrast.
If the ticket can't be made (e.g. the secret is missing), the page still shows the booking
and its reference, which works at the door too.
Trade-off: the SVG is part of the page HTML (a few KB).

## 048 — Organiser dashboard: what organisers see, and how it's counted
Date: 2026-11-23
**What's shown:** per event: seats confirmed, seats on a running hold, seats left, revenue
(confirmed only, at each booking's saved price, decision 009), and every booking (reference,
attendee name, seats, total, status, time), newest first, up to 200.
**Attendees by name only.** Options: (1) name and email (2) name only (chosen)
Why: the organiser needs a name to welcome people and the reference/QR to check them in;
an email is personal data they don't need to run the event (data minimisation, UK GDPR).
Trade-off: an organiser can't contact attendees yet (e.g. "the venue changed"). If that's
needed, it should be a message sent BY the app (phase 6 emails), not a list of addresses.
**One counting rule.** The numbers come from the same `takenWhere` rule as "seats left", in
one grouped query for a whole list of events (no N+1). So confirmed + held + left always
equals the seat limit, and the dashboard can't disagree with the public page (a test
compares them).
**A test that passed for the wrong reason:** breaking the count (counting every HELD row,
even holds that ran out) passed all tests at first, because the dashboard saves EXPIRED
before counting. The My events list doesn't, so it would have shown run-out holds as held.
A new test with a hold still stored as HELD caught it.
Trade-off: the event page now runs two queries (summary and list); fine at this size.

## 049 — Email: Resend's HTTP API, in sandbox mode (no domain)
Date: 2026-11-23
Options: Resend, Mailgun, Postmark, SendGrid, Brevo (free plans checked in their docs on 23 Nov)
Chose: Resend, called with `fetch` over its HTTP API (no SDK, no SMTP).
Why:
- Biggest free plan of the ones I could check: 3,000 emails/month, 100/day, free forever.
  Mailgun is 100/day, Postmark 100/month, SendGrid is now a 60-day trial only.
- HTTP, not SMTP: Render's free plan blocks outgoing SMTP ports.
- `fetch` instead of the SDK: one request, and I control the timeout (10 s), the
  `Idempotency-Key` header (Resend remembers it for 24 hours, so a retry can't send twice)
  and how errors are sorted (retryable: timeout, network, 429 rate limit, 5xx; permanent:
  400/401/403/422, quota used up).
**Sandbox, because there's no domain:** Resend only sends to other people from a domain
you own (with SPF/DKIM records), and `vercel.app` isn't ours. Without one, it delivers only
to the Resend account's own address. I'm not spending money, so: `EMAIL_FROM` is
`onboarding@resend.dev`, and `EMAIL_SANDBOX_ALLOWLIST` lists who may get email (my address).
Anyone else is logged as `skipped: sandbox` and counts as done. Unset means nobody (so a
missing setting can't email real attendees); `*` means everyone, for when a domain exists.
**Rules:** email never fails or slows a booking (sent from a background job in 6b; no key
→ `skipped: disabled`). Emails link to My tickets: no QR code, no ticket JWT, no meeting
link, no secrets. Organiser text is HTML-escaped. Logs name an email by its idempotency
key, never by address.
Trade-off: real attendees get no email until there's a domain. The whole flow still runs and
is tested; only the last step is skipped.
Revisit if: real users arrive (phase 9): buy a domain, verify it, set the allowlist to `*`.
**Known limitation: click tracking (checked 23 Nov).** In the first real test email, the My
tickets link was rewritten to go through resend-clicks.com. We can't turn this off yet.
Resend's docs say tracking is a setting of each domain ("Open and click tracking is
disabled by default for all domains"), set in the dashboard or with `click_tracking` on the
Update Domain API, and that it needs a verified tracking subdomain. `POST /emails` has no
per-email option. The docs say nothing about the shared `resend.dev` sender, and we don't
own that domain, so there is nothing for us to configure. Only the HTML version's links are
rewritten ("Resend modifies each link in the body of the HTML email"). Resend also advises
"disabling open rates for transactional email".
Fix when we have a domain: verify it, and leave open and click tracking off (the default).
Sources: https://resend.com/docs/dashboard/domains/tracking ,
https://resend.com/docs/api-reference/domains/update-domain ,
https://resend.com/docs/api-reference/emails/send-email

## 050 — Background jobs: pg-boss (a queue in Postgres), not Redis
Date: 2026-11-23 (facts checked against the docs the same day)
Options: (1) pg-boss, in the Postgres we already have
         (2) BullMQ + Redis (Upstash free plan)
Chose: 1.
Why:
- The job can be saved in the same transaction as the booking: `send()` takes a `db`
  option ("you can use your own" adapter: `executeSql(text, values)`) [jobs]. So a
  confirmed booking always has its email job, and a rolled-back one never does.
- It has what phase 6 needs: `retryLimit`, `retryDelay` and `retryBackoff` ("exponential
  backoff retries based on retryDelay") [jobs]; a dead letter queue, set as the `deadLetter`
  option on `createQueue()` [queues]; delayed jobs with `startAfter` [jobs]; cron with
  `schedule()` [scheduling]; and `singletonKey`, one job per key [jobs].
- No new service, account or secret: its tables go in a schema named `pgboss` by
  default [constructor]. Needs Node 22.12+ and PostgreSQL 13+ [readme].
- Redis on Upstash's free plan has 500K commands per month [upstash-pricing], and
  Upstash's BullMQ page says "BullMQ accesses Redis regularly, even when there is no queue
  activity" [upstash-bullmq].
**Connections:** both of our DATABASE_URLs are direct connections, not Neon's pooler.
Neon's pooler is PgBouncer in transaction mode and doesn't support LISTEN/NOTIFY or
session-level advisory locks [neon-pooling]. pg-boss uses LISTEN/NOTIFY only if
`useListenNotify` is on (default false), and that doesn't work through PgBouncer in
transaction mode [constructor]. The only advisory lock its docs mention is
`pg_advisory_xact_lock`, which is transaction-scoped [backends]. So the pooler would
probably work too; direct is simply what we have.
Trade-off: workers poll the database, by default "1 job every 2 seconds" [workers]. Neon's
free plan has 100 CU-hours per project per month and scales to zero only after 5 minutes
of inactivity, which can't be changed on Free [neon-plans]. My reasoning (to be measured
in 6c): while the API is awake, polling every 2 s means Neon is never idle for 5 minutes.
Render's sleep and that budget must be planned together.
Revisit if: polling uses too much of Neon's budget, or Redis arrives anyway (phase 7).
Sources:
- [jobs] https://pgboss.io/api/jobs
- [queues] https://pgboss.io/api/queues
- [scheduling] https://pgboss.io/api/scheduling
- [constructor] https://pgboss.io/api/constructor
- [workers] https://pgboss.io/api/workers
- [backends] https://pgboss.io/database-backends
- [readme] https://github.com/timgit/pg-boss
- [neon-pooling] https://neon.com/docs/connect/connection-pooling
- [neon-plans] https://neon.com/docs/introduction/plans
- [upstash-pricing] https://upstash.com/pricing/redis
- [upstash-bullmq] https://upstash.com/docs/redis/integrations/bullmq

## 051 — How the confirmation email job runs
Date: 2026-11-23
**Saved with the booking.** The job (`{ bookingId }` only, no address or content) is
saved with `send(..., { db: fromPrisma(tx) })` inside the transaction that sets
CONFIRMED: the Stripe webhook (decision 041) and free bookings. Two webhook copies at
once still make one job, because only the copy that confirms under the row lock saves
one (tested).
**Built when it runs, not when it's queued.** The worker reads the booking fresh: if it
was refunded in between, nothing is sent.
**What a result means:**
- sent, or skipped on purpose (sandbox, no key, booking gone) → completed
- a retryable error (timeout, 5xx, rate limit, or the database) → failed; pg-boss retries
  5 times with exponential backoff from 30 s (about 15 minutes in all), then moves it to
  the dead letter queue `email.dead-letter`
- a permanent error (bad key, refused address) → straight to the dead letter queue:
  retrying the same request gets the same answer
- the stored output holds only the error name, never an address, key or Resend's text
**pg-boss starts before the API takes requests** (`index.ts`). A confirm needs the
queue, so if pg-boss can't start, the process exits and the deploy fails, instead of
running and failing bookings.
**Worker settings:** one job at a time, polling every 5 s (default 2 s; fewer queries,
and a few seconds' delay doesn't matter for an email), pool of 3 connections.
**Tests use their own schema** (`pgboss_test`), so a test's job can never be sent by
a local API's worker on the same dev database. The retry and dead letter tests run a
real worker on real queues with 1-2 s delays.
**Node:** pg-boss needs Node 22.12+, so `api/package.json` now has `engines.node`
`>=22.12.0 <25` (local is 22; Render's docs say services created since 21 Oct 2026
default to 24.22.1, and Render reads `engines` if nothing else sets the version).
Trade-off: a confirmed booking whose email fails 6 times stays in the dead letter queue
until someone redrives it; nobody is alerted yet (monitoring is phase 8). The pgboss
schema is created in the production database on the first deploy.
Revisit if: emails need to go out faster (lower polling), or job volume grows.

## 052 — Reminder emails, while Render sleeps
Date: 2026-11-23
**The job:** when a booking is confirmed, a reminder job is saved in the same transaction
as the confirmation job (decision 051), with `startAfter` = 24 hours before the event.
pg-boss doesn't give it to a worker before then. Booked less than 24 hours before the
event: no reminder (the confirmation is enough).
**Checked when it runs, days later:** the booking must still be CONFIRMED, the event
PUBLISHED and not started. If the organiser moved the event later, the job queues a new
reminder for the new time and finishes without sending. The idempotency key is
`event-reminder/<bookingId>/<start time>`, so a retry can't send twice, but a moved event
gets its own reminder. If the event moved earlier, the old job simply runs when it was
due (or at the next wake-up) and sends if the event hasn't started.
**Waking Render.** Render's free plan sleeps after 15 minutes and has no cron jobs
(decision 013), so nothing runs the worker at 3 a.m. Options:
(1) an external scheduler calling the API (GitHub Actions, cron-job.org)
(2) a paid Render plan or Render cron job (not free)
(3) send reminders lazily, when someone happens to use the site (unreliable)
Chose: 1, a GitHub Actions workflow (`.github/workflows/wake-api.yml`) that calls the
public `/health` every 3 hours, at minute 17. No secret: `/health` is public and does
nothing but wake the API; pg-boss starts with it and sends what's due. The workflow's
token has no permissions (`permissions: {}`).
Facts (GitHub docs, checked 23 Nov): standard runners are free for public repositories;
times are UTC; the shortest interval is 5 minutes; runs "can be delayed during periods of
high loads", and the start of every hour is busiest; in a public repository, scheduled
workflows are disabled after 60 days without repository activity.
**Cost (my estimate, to measure):** each wake keeps Render up about 15 minutes, and
pg-boss's polling keeps Neon awake that long plus Neon's 5 minutes before it sleeps:
about 20 minutes. 8 a day ≈ 80 hours a month ≈ 20 CU-hours at 0.25 CU, of the free
100. Every hour would be 3 times that.
Trade-off: a reminder arrives between about 21 and 24 hours before the event (later if
GitHub delays a run), not at exactly 24. If GitHub disables the schedule after 60 quiet
days, reminders stop until it's re-enabled.
Revisit if: exact timing matters, the Neon numbers are higher than estimated, or the API
moves to an always-on plan (then the schedule isn't needed).
Sources: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule ,
https://docs.github.com/en/billing/concepts/product-billing/github-actions

## 053 — A circuit breaker around the email provider
Date: 2026-11-24
Options: (1) retries only (pg-boss already retries each job with backoff)
         (2) a library (e.g. opossum)
         (3) a small breaker of my own (`lib/circuit-breaker.ts`, ~100 lines)
Chose: 3.
Why: retries handle one failed request, not a provider that is down. With Resend down,
every job would still wait for its 10 s timeout, again on every retry. The breaker
opens after **5 retryable failures in a row** (timeouts, network errors, 5xx, rate
limits) and then fails every send at once for **60 s**, without calling Resend. Then one
trial request (half-open): success closes it, failure opens it for another 60 s. Only
one trial at a time.
- A fast failure while open is a **retryable** EmailSendError, so pg-boss retries the job
  later; no email is lost, it just waits.
- Errors where Resend answered (bad address, bad key) don't count: the provider is up.
- Sandbox skips never reach it.
- One breaker per process, shared by both email workers (same provider).
- State changes are logged (`[email] circuit closed -> open`), never with addresses.
- Own code rather than a library: it's small, fully tested with a fake clock, and the
  point of this project is to understand it. At a company I'd use a maintained library.
Trade-off: the state lives in memory, so a restart (or Render waking up) starts closed,
and two API instances would each have their own breaker. Fine with one instance.
Revisit if: the API runs more than one instance, or other providers need the same
protection.
