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
## 019 — One shared database for development and production (temporary)
Date: 13 Nov 2026
 
**Options considered:** Keep one Neon database vs separate dev and production now (Neon branch or second project)
**Decision:** Keep one database for now. Separating them is the next ticket after this one.
**Why:** No real users yet, and the frontend work didn't need schema changes.
**Trade-off:** Running the seed or `migrate dev` locally changes live data. On 6 Nov a seed crash emptied the live database.
**Revisit if:** Before phase 2 (auth) at the latest, because real accounts would be wiped by a seed.
 