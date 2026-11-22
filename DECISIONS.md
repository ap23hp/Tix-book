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