# Tixbook — instructions for Claude Code

Tixbook is an event and ticket booking app: organisers publish events, attendees book
seats, and the system must never sell the same seat twice. Live at
https://tix-book.vercel.app (API: https://tixbook-api.onrender.com).

I'm Apra. I'm building this to **learn** production full-stack skills for UK job
interviews, not just to have an app. Help me move fast, but I must be able to explain
every line.

## How to work with me

- **Reply in English only**, even when I write in Hinglish (I'm practising for interviews).
- **Explain before or right after each change**: what it does and why, in short, plain
  sentences. No analogies. Give me one "interview line" for each new concept.
- **Mechanical work: just do it** (placing files, running lint/tests/build, fixing lint
  and formatting, renaming). **New concepts: explain first**, then build, so I can
  follow along.
- When something fails, show me the error and what it tells us before fixing it.
- Check current docs instead of guessing (Next.js 16 docs are in
  `web/node_modules/next/dist/docs`). Say clearly when you're not sure.
- Keep changes small and in the order of the plan. Don't add features I didn't ask for.
- After each concept, write a short `LEARNING_LOG.md` entry in simple words, and a
  `DECISIONS.md` entry for any real choice (options, what we chose, why, trade-off).

## Workflow (always)

1. GitHub Issue first (`[Area]` or `[Phase Nx]` prefix).
2. Branch from an up-to-date `main`: `feature/<issue#>-name` (or `fix/…`, `chore/…`).
   Never commit to `main`.
3. Small commits with conventional messages: `feat(web): …`, `fix(api): …`, `docs: …`.
   `git add` **named files**, never `git add .`. Run `git status` before every commit.
4. PR with `Closes #<issue>` only in the PR that finishes the Issue.
5. Wait for the Vercel check to be green. **Squash and merge**, and edit the squash
   title to a conventional message ending in `(#<PR>)`.
6. After merge: `git checkout main && git pull && git branch -D <branch>`, then check
   production (Render → Live, Vercel → Ready).

Phase 3 is 2 PRs: 3a "Find events" (done) and 3b "My pages + polish". Phases 4–9 follow
`claude/PLAN.md` in my Claude Project. Goal: finish all phases by end of November 2026,
full scope.

## Commands

API (`api/`):

- `npm run dev` (port 4000), `npm run lint`, `npm test`, `npm run build`
- Prisma: **every** command needs `--config prisma7.config.ts`, e.g.
  `npx prisma migrate dev --config prisma7.config.ts`, then
  `npx prisma generate --config prisma7.config.ts`
- Tests hit the **dev** database. Test data uses email prefixes (`auth-test-`,
  `events-test-`, `google-test-`, `ratelimit-test-`, `cache-test-`, `querycount-test-`) and is deleted in
  `afterAll`. A file's prefix must not be the start of another file's
  (`test-prefixes.test.ts` checks this).

Web (`web/`):

- `npm run dev` (port 3000), `npm run lint`, `npm test`, `npm run build`
- Don't run `npm run format` for the whole folder: it reformats ~20 unrelated files.
  Format only the files you changed (`npx prettier --write <files>`).

On Windows, if deleting `node_modules` fails with EPERM, VS Code extensions are holding
native `.node` files: close them and stop Node processes first.

## Safety rules (never break these)

- Never read out, print, paste or commit `.env`, `.env.local`, `.env.test`, connection
  strings, secrets or session tokens. Never commit `src/generated`.
- Local `api/.env` must only ever hold the **dev** Neon branch. Production secrets live
  only in Render and Vercel.
- If `prisma migrate dev` mentions **reset**, stop and ask me.
- Never run `npm audit fix --force`.
- Never log passwords or session tokens; store only hashes.
- Don't change Vercel, Render, Neon or Google Cloud settings yourself; tell me what to
  change.
- Ask before anything that deletes data or can't be undone.

## Stack and conventions

- TypeScript everywhere. `web/`: Next.js 16 (App Router, `cacheComponents: true`,
  `partialPrefetching: true`), React 19, Tailwind v4, Jest + React Testing Library.
  `api/`: Express 5 (ESM, strict TS, `noUncheckedIndexedAccess`), Prisma 7 + Neon
  Postgres, Zod 4, argon2, arctic (Google OAuth), Jest + supertest.
- **Browser → API** calls use relative `/api/...` URLs (Vercel rewrite → Render), so the
  session cookie is first-party. **Server Components → API** use `API_URL` and forward
  the `session` cookie by hand (`web/lib/auth.ts`).
- **Errors:** routes `throw new HttpError(status, message)` or use
  `parseOrThrow(schema, data, message)`; one error handler returns `{ error, details? }`.
- **Auth:** sessions (not JWT), cookie `session` (httpOnly, Secure, SameSite=Lax),
  `requireAuth` (401) and `requireRole` (403); the organiser always comes from the
  session, never from the request body. CSRF: `blockCrossSiteWrites` (Sec-Fetch-Site).
- **Lists:** cursor (keyset) pagination on (startsAt, id): `{ events, nextCursor }`.
- **Cache Components:** reading `cookies()` or `searchParams` must happen inside
  `<Suspense>`. Hidden pages stay in the DOM (`<Activity>`), so form state persists
  (reset login-style forms on hide) and element ids must be unique across pages.
- Comments explain **why**, in plain English, as in the existing code.
- Every change comes with tests; keep all existing tests passing.
