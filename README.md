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

- **Event list:** upcoming published events from the API, grouped by month, with "in X days"
- **Event detail:** date, time, venue or online format, seats left, sold-out state
- **Every state designed:** loading skeletons, error with Retry (cold start), event not found, empty list
- **Accessibility:** semantic HTML, skip link, visible focus ring, colour contrast checked against WCAG AA, reduced-motion support
- **Times in the event's own timezone:** GMT in winter, BST in summer, never hard-coded

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router, Server Components, Cache Components), React 19, TypeScript, Tailwind CSS v4 |
| API | Node.js, Express 5, TypeScript, Zod validation |
| Database | PostgreSQL (Neon) with Prisma ORM and migrations |
| Tests | Jest + Supertest (API) |
| Hosting | Vercel (frontend), Render (API), Neon (database), all on free plans |

## How it fits together

```
Browser
  → Next.js on Vercel        Server Components fetch data on the server
  → Express API on Render    GET /api/v1/events, GET /api/v1/events/:id
  → Prisma                   TypeScript queries → SQL
  → PostgreSQL on Neon
```

- **The frontend fetches on the server**, so the API URL stays in a server-only environment variable and no CORS setup is needed.
- **Pages are partially prerendered:** a static shell (header, title, skeleton) is sent instantly, and event data streams in inside `<Suspense>`.
- **The API enforces the rules** (only published, future events; private fields like the meeting link are never returned), because the client can always be bypassed.

## Key decisions

Every decision, the options considered and the trade-offs are in [DECISIONS.md](./DECISIONS.md). A few highlights:

- **Separate Express API instead of Next.js-only:** clear frontend/backend boundary, and booking needs long-running background work (expiring seat holds, job queues). The cost is two deployments.
- **Seats left are calculated, not stored:** one source of truth, so the count can't drift.
- **Money stored as integer pence:** avoids floating-point rounding errors.
- **PostgreSQL:** bookings, events and users are tightly related, and booking needs transactions and row locking.

## Run it locally

You need Node.js 22 and a PostgreSQL connection string (for example a free Neon database).

```bash
# API (port 4000)
cd api
npm install
# create api/.env with DATABASE_URL=...
npx prisma migrate dev --config prisma7.config.ts
npx prisma db seed --config prisma7.config.ts   # ⚠️ deletes all data first
npm run dev

# Frontend (port 3000), in a second terminal
cd web
npm install
# create web/.env.local with API_URL=http://localhost:4000
npm run dev
```

Run the API tests with `npm test` inside `api/`.

## Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Foundations: schema, API, event pages, deploy | ✅ Done |
| 2 | Auth and security: login, roles, OAuth, CSRF/XSS | Next |
| 3 | Search, pagination, "My tickets", end-to-end tests | Planned |
| 4 | **Booking and concurrency:** 5-minute seat holds, locking, idempotency | Planned |
| 5 | Payments with Stripe (test mode) and webhooks | Planned |
| 6 | Background jobs: confirmation and reminder emails, retries | Planned |
| 7 | Performance: indexes, caching, rate limiting, Core Web Vitals | Planned |
| 8 | Docker, CI/CD, monitoring | Planned |
| 9 | Real users, load test, "How I'd scale this" | Planned |

## Project docs

- [DECISIONS.md](./DECISIONS.md): decisions and trade-offs
- [QUALITY_NOTES.md](./QUALITY_NOTES.md): testing approach and known issues
- [LEARNING_LOG.md](./LEARNING_LOG.md): what I learned at each step, including mistakes
- [AI_USAGE.md](./AI_USAGE.md): how I used AI while building this
- [docs/](./docs): database schema and wireframes

---

Built by Apra Khanna.