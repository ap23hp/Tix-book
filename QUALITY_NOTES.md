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