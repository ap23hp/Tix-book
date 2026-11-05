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
- Seats left = seatLimit − seats in HELD + CONFIRMED bookings, calculated with a database `aggregate` (decision 005).
- ⚠️ Phase 4: a HELD booking whose hold has expired still counts as taken until the cron job marks it EXPIRED. Seats left may be slightly too low for up to a minute. Fix in phase 4: also check `holdExpiresAt > now` when counting held seats.
- To do (phase 3): the events list doesn't include seats left yet. Adding it per event needs care to avoid an N+1 query problem.