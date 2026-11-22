# Tixbook

An event and ticket booking app. Organisers publish events; attendees browse them, hold a seat, pay and get a ticket.

**The hard problem it is built around:** when 100 people try to book the last 5 seats at the same moment, exactly 5 get them, nobody is charged twice, and unpaid holds are released.


## Live

| | Link |
|---|---|
| **App** | https://tix-book.vercel.app |
| **API** | https://tixbook-api.onrender.com/api/v1/events |

> ⏳ **The first load can take up to a minute.** The API runs on Render's free plan, which sleeps after 15 minutes without traffic. If you see *"Couldn't load events"*, wait a few seconds and press **Retry**. That screen is designed for exactly this.

## What works today

- **Find events:** search by title, filter by category and format, "Load more" with cursor pagination. Filters live in the URL, so results can be shared and survive a refresh.
- **Event pages:** date and time in the event's own time zone (GMT/BST), venue or online, seats left and sold-out state. The list shows "Only N seats left" from the same calculation as the event page.
- **Accounts:** sign up and log in with email and password, or with Google (OAuth 2.0 + PKCE). Sessions in httpOnly cookies, roles (attendee, organiser), CSRF protection.
- **For organisers:** create events, "My events" (drafts included), and edit an event. Another organiser's event is refused with a 404, the same as an unknown id (IDOR protection).
- **UI kit:** Button, Input, Select, Card, Badge, Spinner, Modal (native `<dialog>`) and Toast (screen-reader live regions).
- **Every state designed:** loading, empty, error with Retry (cold start), not found.
- **Accessibility:** semantic HTML, skip link, visible focus ring, keyboard-only use checked, WCAG AA contrast, reduced motion, axe checks with no violations.
- **Responsive:** checked at phone (375px), tablet (768px) and desktop (1280px).

Booking itself (seat holds, payments, tickets and "My tickets") is phase 4 and 5.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router, Server Components, Cache Components), React 19, TypeScript, Tailwind CSS v4 |
| API | Node.js, Express 5, TypeScript, Zod validation |
| Auth | Database sessions (own code), argon2 password hashing, Google login with Arctic |
| Database | PostgreSQL (Neon) with Prisma ORM and migrations |
| Tests | Jest + Supertest (API), Jest + React Testing Library (web), Playwright + axe (end-to-end and accessibility) |
| Hosting | Vercel (frontend), Render (API), Neon (database), all on free plans |

## How it fits together

```
Browser
  → Next.js on Vercel        Server Components fetch data on the server
                             /api/* is rewritten to the API (cookies stay first-party)
  → Express API on Render    /api/v1/events, /api/v1/auth, ...
  → Prisma                   TypeScript queries → SQL
  → PostgreSQL on Neon
```

- **The frontend fetches on the server**, so the API URL stays in a server-only environment variable and no CORS setup is needed. Browser requests go through a Vercel rewrite, so the session cookie belongs to our own site.
- **Pages are partially prerendered:** a static shell (header, title, skeleton) is sent instantly, and data streams in inside `<Suspense>`.
- **The API enforces the rules** (who is logged in, roles, who owns an event, valid data), because the client can always be bypassed.

## Key decisions

Every decision, the options considered and the trade-offs are in [DECISIONS.md](./DECISIONS.md). A few highlights:

- **Separate Express API instead of Next.js-only:** clear frontend/backend boundary, and booking needs long-running background work (expiring seat holds, job queues). The cost is two deployments.
- **Sessions, not JWT, for login:** logging out really ends the session (decision 023).
- **Seats left are calculated, not stored:** one source of truth, so the count can't drift.
- **Money stored as integer pence:** avoids floating-point rounding errors.
- **PostgreSQL:** bookings, events and users are tightly related, and booking needs transactions and row locking.

## What broke after launch

Real problems from running the live app, and what changed because of them:

- **Running the seed locally wiped the live data (6 Nov).** My laptop and Render used the same database, and the seed deletes everything before inserting. It also crashed halfway once, leaving the database empty. Fix: separate dev and production databases (Neon branches), the seed runs in one transaction, and it refuses to run unless the database host is the dev one (decisions 019 and 020).
- **The first visit hung on a loading skeleton.** Render's free plan sleeps, and waking up takes about a minute. Fix: a 10-second timeout and an error page that says the server may be waking up, with a Retry button (decision 017).
- **Login forms kept old passwords and errors after navigating away (16 Nov, #27).** With Cache Components, Next.js hides pages instead of removing them, so form state stays. Fix: clear login and sign-up forms when the page is hidden, plus a test that hides and shows the form.
- **A Next.js security release (17 Nov, #32).** Upgraded to Next.js 16.4.6 the same day.

Open questions I haven't solved yet are in [QUALITY_NOTES.md](./QUALITY_NOTES.md#open-questions).

## Run it locally

You need Node.js 22 and a PostgreSQL connection string (for example a free Neon database).

```bash
# API (port 4000)
cd api
npm install
# create api/.env with DATABASE_URL=... (a dev database, never production)
npx prisma migrate dev --config prisma7.config.ts
npx prisma db seed --config prisma7.config.ts   # ⚠️ deletes all data first
npm run dev

# Frontend (port 3000), in a second terminal
cd web
npm install
# create web/.env.local with API_URL=http://localhost:4000
npm run dev
```

Tests:

- `npm test` in `api/`: API tests (Jest + Supertest). They use the dev database and delete their own test data.
- `npm test` in `web/`: unit and component tests (Jest + React Testing Library).
- `npm run test:e2e` in `web/`: end-to-end and accessibility tests (Playwright + axe). Run `npx playwright install chromium` once first.
- `npm run lint` in `web/` includes the full jsx-a11y accessibility rules.

## Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Foundations: schema, API, event pages, deploy | ✅ Done |
| 2 | Auth and security: login, roles, OAuth, CSRF | ✅ Done |
| 3 | Search, pagination, my events and editing, UI kit, accessibility, end-to-end tests | ✅ Done |
| 4 | **Booking and concurrency:** 5-minute seat holds, locking, idempotency, "My tickets" | Next |
| 5 | Payments with Stripe (test mode) and webhooks | Planned |
| 6 | Background jobs: confirmation and reminder emails, retries | Planned |
| 7 | Performance: indexes, caching, rate limiting, Core Web Vitals | Planned |
| 8 | Docker, CI/CD, monitoring | Planned |
| 9 | Real users, load test, "How I'd scale this" | Planned |

## Project docs

- [DECISIONS.md](./DECISIONS.md): decisions and trade-offs
- [QUALITY_NOTES.md](./QUALITY_NOTES.md): testing approach, known issues and open questions
- [LEARNING_LOG.md](./LEARNING_LOG.md): what I learned at each step, including mistakes
- [AI_USAGE.md](./AI_USAGE.md): how I used AI while building this
- [docs/](./docs): database schema

---

Built by Apra Khanna.
