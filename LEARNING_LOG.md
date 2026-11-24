### Git and GitHub
- **Issue** = a ticket (a piece of work). Lives in the Issues tab.
- **Branch** = my own copy to work on, so `main` stays safe. One branch per ticket.
- **Commit** = save a checkpoint. **Push** = upload it to GitHub.
- **PR (pull request)** = "please check my work and add it to main".
- Write `Closes #N` in the PR description BEFORE merging, so the issue closes by itself.
- Issues and PRs share numbers on GitHub. Always check the real issue number.
- After merging, delete the branch. The work is already in `main`.

### Database basics
- **Table** = like a sheet. **Row** = one item. **Column** = one piece of info.
- **Primary key (id)** = a unique ID for each row.
- **Foreign key** = a column that points to a row in another table (e.g. booking.userId → user).
- **Unique** = no two rows can have the same value (e.g. email).
- **Nullable** = the column is allowed to be empty.
- **Enum** = a column that only allows fixed values (e.g. role: ATTENDEE or ORGANISER).
- Store each fact in ONE place. Point to it with a foreign key. Don't copy it.

### Rules I decided
- The database stores the data. The app checks the rules.
  (e.g. "venue is required only for in-person events" is checked by the app.)
- Money is stored in pence as whole numbers (£12.50 = 1250), because decimals aren't exact (0.1 + 0.2 ≠ 0.3).
- Seats left is calculated, not stored. Correct first, fast later.

### Idempotency
- **Idempotent** = doing it twice has the same effect as doing it once (like a lift button).
- When the seat sheet opens, the frontend makes ONE random ID. Every tap sends the same ID.
- The server saves it in a unique column. A second request with the same ID is rejected, and the user just gets the first booking.

### Cron job
- A task that runs by itself on a schedule (like an alarm).
- Mine will run every minute and release expired seat holds.

### ORM / Prisma
- **ORM** = lets me talk to the database in JavaScript instead of SQL.
- Prisma: I write models in `schema.prisma` → Prisma creates the tables → I use ready-made functions like `prisma.event.findMany()`.

### Next.js
- Folders in `app/` with a `page.tsx` become URLs. `app/events/page.tsx` = /events.
- `layout.tsx` = the frame around pages (header, nav). `page.tsx` = the page content.
- Plain React used React Router (routes written in code). Next.js uses files and folders.

### Server vs Client Components
- **Server Component** (default): runs on the server. The browser gets only the finished result, not the code. Fast, but can't change after loading.
- **Client Component** (`"use client"`): code is sent to the browser. Needed for anything that changes after the page loads: clicks, typing, timers.
- **Hydration** = the HTML first arrives like a photo of a button; then the JavaScript loads and "plugs it in" so it works.

## 4 Nov 2026

### Hydration (how a Client Component starts working)
1. Server renders the component once → HTML + script tags + the props it used.
2. Browser shows the HTML straight away (buttons visible but not clickable yet).
3. Browser downloads the JavaScript.
4. React runs the component again in the browser, with the same props.
5. React matches its result to the existing HTML (doesn't rebuild it) and attaches onClick, state and effects.
6. Now it's interactive.
- If server HTML and browser result differ → "hydration mismatch" warning.
  Common causes: Date.now(), Math.random(), window. Watch for this with the countdown (phase 4).

### Hydration vs virtual DOM diffing
- Hydration: ONCE, on first load. Compares React's picture with the server's HTML. Expects a match; just attaches handlers.
- Diffing (reconciliation): on EVERY update. Compares the new virtual DOM with the previous one, then changes only what's different on the page.

### Why useEffect never runs on the server
- useEffect runs AFTER the component is on the real page.
- The server never shows a page; it only makes HTML and sends it.
- So effects (timers, listeners, window) only run in the browser.


### Server = Node, not a browser
- Browser-only: window, document, localStorage → crash on the server ("window is not defined").
- Both: fetch, setTimeout, console.log, crypto.randomUUID.
- Server-only: database access, secret keys.
- Even Client Components render on the server first, so put browser-only code inside useEffect or event handlers.
- useEffect/useState in a Server Component → Next.js error: add "use client".

### Hydration mismatch caused by a browser extension
- **Error:** Console warning: "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties." React found extra attributes on `<body>` (`data-gr-ext-installed`, `data-new-gr-c-s-check-loaded`) that the server never rendered.
- **Why:** The Grammarly browser extension added these attributes after the page loaded but before React hydrated. So the browser's HTML no longer matched the server's HTML.
- **How I confirmed it:** Opened the page in an incognito window (extensions off). The error disappeared.
- **Fix:** Either ignore it (harmless), or add `suppressHydrationWarning` to the `<body>` tag in `app/layout.tsx`. That silences mismatches on `<body>` only; real mismatches in my own components still show.

### Express
- Express is a framework built on top of Node. Node can make a web server on its own (http module), but we will have to handle routing, reading requests and sending responses by hand. Express does that for us.it's a layer on top of Node

### Routes
- A route = HTTP method + path + a handler function.
- GET /events and POST /events are DIFFERENT routes on the same path.
- Tixbook examples:
  - GET /events → list events
  - GET /events/:id → get one event
  - POST /events → create an event
  - GET /health → check the server is alive

### GET vs POST
- GET: ask the server for data. Changes nothing.
- POST: send data to the server (in the request body), usually to create something. The server may send the created item back.

### /health endpoint
- A simple endpoint that returns { "status": "ok" } with status 200.
- Called by other systems, not people: Render (my host) checks the server is up; UptimeRobot alerts me if it stops answering.

### Why TypeScript?
- TypeScript finds mistakes while I'm writing code, before it runs. JavaScript would only break later.

### What does tsx do?
- Node only understands JavaScript. My files are TypeScript.
- tsx runs my TypeScript files directly while I'm coding.
- `tsx watch` restarts the server every time I save.
- tsx does NOT check for type errors. My editor and `tsc` do that.

### src vs dist
- `src/` = the TypeScript code I write.
- `dist/` = the JavaScript made from it by `tsc`. Node runs this in production.
- dist is not committed to Git because it can always be made again.

### The flow
- While coding: `npm run dev` → tsx runs src/index.ts
- For production: `npm run build` → tsc makes dist/ → `npm run start` runs dist/index.js

### Prisma setup (big picture)
- Goal: my API needs to save and read data (users, events, bookings) in Neon.
- The database only understands SQL. Prisma lets me write TypeScript instead.
- Steps:
  1. Neon = the database (hosted Postgres in Frankfurt)
  2. .env holds DATABASE_URL (the address + password; never committed)
  3. `npx prisma init` created:
     - `prisma/schema.prisma` → where my models (tables) go
     - `prisma7.config.ts` → tells Prisma where the schema, migrations and database URL are
  4. `dotenv` reads .env into `process.env` (the config file needs it)
  5. Write models → `npx prisma migrate dev` creates real tables → seed fake data
- `generator client` → Prisma writes TypeScript code (the client) into `src/generated/prisma`. It's generated, so not committed.
- Prisma's comment suggesting `npx create-db` is Prisma advertising its own database. I kept Neon: already set up, free plan checked, and the ORM and database host stay separate.

### Enum
- A fixed list of allowed values. Anything else is rejected.
- Example: `enum Role { ATTENDEE ORGANISER }`
- Why not String? A string allows typos ("orgniser"). An enum is checked by the database AND TypeScript (autocomplete + red underline on typos).

### Naming conventions (habits, not rules; be consistent)
| What | Style | Example |
|---|---|---|
| Model names | PascalCase | User, Event, Booking |
| Field names | camelCase | passwordHash, createdAt |
| Enum names | PascalCase | Role, EventStatus |
| Enum values | UPPER_CASE | ATTENDEE, IN_PERSON |
- Lowercase would work too, but conventions help other developers read the code instantly.

### Prisma syntax cheat sheet
- Each line: `fieldName Type options`
- Types: `String`, `Int`, `DateTime`, or an enum name
- `?` after the type → nullable (can be empty). No `?` → required.
- `@id` → primary key
- `@default(uuid())` → auto-generate a unique ID
- `@unique` → no duplicates
- `@default(now())` → set to the current time when created
- `@default(DRAFT)` → default enum value
- `@updatedAt` → Prisma updates it automatically on every change
- `events Event[]` → "has many". NOT a real column; lets me write `user.events`.

### Foreign keys in Prisma
```prisma
organiserId String
organiser   User   @relation(fields: [organiserId], references: [id])
```
- `organiserId` → the REAL column (stores the user's id)
- `organiser` → NOT a column; lets me write `event.organiser.name`
- `fields: [organiserId]` = my column; `references: [id]` = the other table's id
- The real link always lives on the "many" side (Event has organiserId; Booking has userId and eventId).

### Commands
- `npx prisma format` → tidies and aligns the schema file
- `npx prisma validate` → checks the schema for mistakes

## 5 Nov 2026

### User model — line by line
| Field | Required? | Rule | Why |
|---|---|---|---|
| `id` | auto | primary key, auto-generated | identifies each user |
| `name` | yes | | everyone has a name |
| `email` | yes | unique | no duplicate accounts |
| `passwordHash` | no (`?`) | | Google users have no password |
| `googleId` | no (`?`) | unique when filled | one Google account = one user |
| `role` | yes | enum (ATTENDEE / ORGANISER) | only two allowed values |
| `createdAt` | auto | `@default(now())` | when they signed up |
| `updatedAt` | auto | `@updatedAt` | when the row last changed |
| `events`, `bookings` | — | NOT real columns | lets code reach related rows (`user.events`) |


### Where @ things come from
- Anything starting with `@` is a Prisma attribute (a rule on a field): `@id`, `@unique`, `@default`, `@updatedAt`, `@relation`.
- `@@` = a rule on the whole model (e.g. `@@index`).
- `now()` and `uuid()` are Prisma functions, used inside `@default(...)`.
- All built into Prisma. Look them up in the "Prisma schema reference" docs.

### Unique + nullable (googleId)
- `?` → can be empty (email/password users have no Google ID).
- `@unique` → if filled, no two users can share it.
- Postgres allows many empty (null) values in a unique column; only filled values must differ.

### Event model — line by line
| Field | Required? | Rule | Why |
|---|---|---|---|
| `id` | auto | primary key, `@default(uuid())` | identifies each event |
| `title` | yes | | event name |
| `description` | yes | | event details |
| `category` | yes | | Comedy, Music, Business... |
| `format` | yes | enum EventFormat (IN_PERSON / ONLINE) | the in-person / online toggle |
| `status` | yes | enum EventStatus, `@default(DRAFT)` | new events start as drafts; only published ones are visible |
| `startsAt` | yes | | start date + time |
| `endsAt` | yes | | end date + time |
| `doorsAt` | no (`?`) | | in-person only |
| `timezone` | yes | | e.g. Europe/London |
| `venueName` | no (`?`) | app checks it's filled for in-person | in-person only |
| `venueAddress` | no (`?`) | app checks it's filled for in-person | in-person only |
| `meetingLink` | no (`?`) | app requires it to publish an online event | online only |
| `pricePence` | yes | whole number | £12.50 = 1250; 0 = free |
| `seatLimit` | yes | | max seats; seats left is calculated (decision 005) |
| `coverImageUrl` | no (`?`) | app requires it to publish | optional for drafts |
| `createdAt` | auto | `@default(now())` | when created |
| `updatedAt` | auto | `@updatedAt` | when last changed |
| `organiserId` | yes | REAL column (foreign key) | stores the id of the User who created it |
| `organiser` | — | NOT a column, `@relation(...)` | lets code write `event.organiser.name` |
| `bookings` | — | NOT a column | one event has many bookings |

### The relation, explained
```prisma
organiserId String
organiser   User   @relation(fields: [organiserId], references: [id])
```
- `organiserId` → the real column. Holds a user's id.
- `organiser` → not a column; the link to the User.
- `@relation(fields: [organiserId], references: [id])` → "my organiserId points to User's id".
- Named `organiserId` (not `userId`) because it says what role that user plays for the event.

## 5 Nov 2026 (continued)

### Events API planning
- GET /events → only PUBLISHED events that haven't started yet, sorted by start date.
- GET /events/:id → 404 if the event doesn't exist OR is a draft. For the public, a draft doesn't exist yet (and 404 doesn't reveal that a hidden event exists).
- POST /events → 201 Created on success; 400 Bad Request for invalid input.
- Seats left = seatLimit − seats in HELD + CONFIRMED bookings.
  - Held seats count too. Otherwise I'd sell seats someone is in the middle of paying for.

### Shared Prisma client
- `new PrismaClient()` opens database connections. Connections are slow to open, and the database allows only a limited number.
- Bad: create a new client in every route or request → too many connections, slow, app starts failing.
- Good: create it ONCE in `src/lib/prisma.ts`, export it, and import it everywhere. All routes reuse the same connections.
- Like a taxi company reusing its cars instead of buying a new car for every passenger.
- I create one Prisma client in a shared module and import it everywhere, so connections are reused instead of opened on every request."
- Related to connection pooling (phase 7).

## Events API

### Express Router
- A Router is a mini-app that groups related routes in their own file (`src/routes/events.ts`).
- Mounted in index.ts with `app.use("/api/v1/events", eventsRouter)`.
- `eventsRouter.get("/")` → GET /api/v1/events; `eventsRouter.get("/:id")` → GET /api/v1/events/:id.
- New routes in the router need no change in index.ts.

### Route parameters
- `/:id` → whatever is in the URL ends up in `req.params.id`.

### Prisma queries I used
- `findMany({ where, orderBy })` → many rows. `gt` = greater than; `asc` = soonest first.
- `findFirst({ where: { id, status: "PUBLISHED" } })` → one row matching ALL conditions (so drafts aren't found).
- `aggregate({ _sum: { seats: true } })` → the database adds up the seats for me.
- `status: { in: ["HELD", "CONFIRMED"] }` → status is one of these.
- `omit: { meetingLink: true }` → hide a field. `select` = show only chosen fields (safer allowlist).
- `?? 0` → if the sum is null (no bookings), use 0.

### Always `return` after sending a response
- After `res.status(404).json(...)`, write `return`. Otherwise the code carries on and tries to send a second response, which crashes.

### Status codes used
- 200 OK (read), 201 Created (new event), 400 Bad Request (invalid input or bad JSON), 404 Not Found (missing or draft), 500 Server Error (our bug).

### Zod (validation)
- TypeScript checks my code while writing. Zod checks incoming data while the app runs.
- `safeParse(req.body)` → success, or a list of problems (doesn't crash).
- `z.coerce.date()` → JSON has no date type; converts date text into a real Date.
- `.trim().min(1)` → "   " doesn't count as a title.
- `.superRefine(...)` → rules comparing several fields (end after start; in-person needs a venue; publishing online needs a link).

### Central error handling
- A 404 handler AFTER all routes catches unknown URLs → JSON instead of an HTML page.
- An error handler has FOUR parameters (err, req, res, next); that's how Express recognises it.
- Log the full error for me (console.error); send only a safe message to the client.
- Broken JSON → express.json() throws `entity.parse.failed` → return 400, not 500.
- Express 5 passes errors from async routes to the error handler automatically.

### Testing with curl
- `curl -X POST url -H "Content-Type: application/json" -d '{...}'` sends a POST with JSON.
- Add `-i` to see the status code.

## 5 Nov 2026 — Events API walkthrough 

### src/lib/prisma.ts
- Creates ONE Prisma client, connected to Neon using DATABASE_URL, and exports it so the whole app reuses it.
- Why one: opening database connections is slow and limited. A new client on every request = too many connections (taxi company reusing its cars).
- Why a `lib/` folder: just organisation. `routes/` = endpoints, `schemas/` = validation rules, `lib/` = shared helpers the rest of the app borrows.

### GET /api/v1/events
- The router uses "/" because it's mounted at /api/v1/events in index.ts. "/" = the start of that path. Writing "/events" would make /api/v1/events/events.
- Returns only PUBLISHED events in the future, soonest first, with meetingLink hidden.

### async / await (gap)
- Database calls take time and return a Promise: a receipt for data that will arrive later.
- `await` = wait here until the real data arrives. Without it, I'd send the receipt (an empty `{}`), not the events.
- `async` = needed on a function that uses `await`.
- While waiting, Node can handle other requests (event loop).
- "Database calls return a Promise; await waits for the real data; async lets the function use await."

### GET /api/v1/events/:id
- Finds the event where the id from the URL (req.params.id) matches AND status is PUBLISHED, with meetingLink hidden.
- Not found → 404, then `return`.
- Why `return`: without it, the code continues, `event.id` crashes on null, and Express tries to send a second response.
- Seats taken = sum of seats in HELD + CONFIRMED bookings. Seats left = seatLimit − seats taken.
- Nothing forces seatsLeft above 0. 0 = sold out (correct). A negative number would mean we oversold, a real bug to PREVENT in phase 4, not hide with Math.max.
- `?? 0` (gap): with no bookings, the sum is null, not 0. TypeScript won't allow `seatLimit - null`. `??` gives a fallback when a value is null or undefined.

### Zod and POST /api/v1/events
- Zod checks incoming data before it's written to the database.
- Why TypeScript can't do it (gap): TypeScript types are REMOVED when the code runs (compiled to plain JS; tsx strips them too). Request data arrives at runtime, when TypeScript is gone. Zod is real code that runs on every request.
  - Like a spell-checker (TypeScript) checking what I type vs opening every letter that arrives (Zod).
- Two kinds of rules:
  - Single-field, inside `z.object({...})`, e.g. `pricePence: z.number().int().min(0)` = a whole number, 0 or more. Rejects -5, 12.5 (no half pennies) and "1200" (text).
  - Cross-field, inside `.superRefine(...)`: end after start; in person needs venue name + address; online + published needs a meeting link. Decision 007 in code.
- POST flow:
  1. Zod safeParse(req.body)
  2. Problems → 400 with { field, message } list → return
  3. Check organiserId belongs to a real ORGANISER → if not, 400 → return
  4. prisma.event.create(...)
  5. 201 + the new event
- 400 = the client sent something wrong, nothing saved. 201 = a new event was created.
- Why the organiser check: Zod checks the SHAPE of data; it can't look in the database to see if the user exists or is an organiser. "Zod checks the shape; the database checks the facts."

### index.ts and middleware
- `express.json()` is middleware: turns the raw JSON text in the request into a JS object on req.body. Without it, req.body is undefined.
- Middleware = a function that runs between the request arriving and the route handler.
- `app.use("/api/v1/events", eventsRouter)`: all event endpoints start with /api/v1/events.
- Order matters (gap): Express runs middleware top to bottom, and the first thing that responds ends it.
  - express.json → routes → 404 catch-all → error handler (only reached on errors)
  - If the 404 handler came first, every request would get "Not found".
- "Express middleware runs top to bottom: body parsing first, then routes, then the 404 catch-all, and the error handler last."

### Testing the API (Jest + Supertest)
- Split app.ts (builds the app, exports it) from index.ts (starts the server), so tests can use the app without starting a server.
- Supertest sends fake HTTP requests straight to the app: `request(app).get("/health")`.
- `describe` = a group of tests; `it` = one test; `expect(x).toBe(y)` = fails if they differ.
- Test files must end in `.test.ts`. My `health.tests.ts` typo meant Jest found 0 tests.
- Don't hard-code IDs in tests; get them from the list first, because IDs change on every reseed.
- "Worker failed to exit gracefully" = something left open (the database connection). Fixed with `afterAll(() => prisma.$disconnect())`: teardown.
- PORT must come from process.env.PORT, or Render can't reach the app.
## 6 Nov 2026 — Deploying the API
 
### Deploying to Render
- Render clones `main`, runs the build command (install → prisma generate → migrate deploy → tsc), then `npm start`.
- Render sets PORT itself (10000 in the log). My app must read `process.env.PORT`.
- Free plan sleeps when idle, so the first request takes ~50 s.
- "Render builds from main, applies any new migrations, then starts the app on the port Render gives it."
### One database, two places (gap)
- The seed writes to whatever database `DATABASE_URL` points to. It doesn't know if that's "local" or "production".
- My laptop's `.env` and Render both point to the same Neon database. So seeding locally resets the live data.
- "The database doesn't belong to an environment. Whoever has the connection string can change it."

 ## Concurrency and booking: (11 Nov 2026)

**Concurrency:** many requests running at the same time.

**Race condition:** two requests run at once and both act on old information, so the result
depends on timing. Tixbook: two people both see "1 place left" and both book it.

**Contention:** how many requests fight over the same data. High contention = many requests
on one row (Tixbook: 100 people, one event row). Low contention = clashes are rare.

**Transaction:** a group of database steps that all succeed or all get undone.
- **Commit:** save all the steps.
- **Rollback:** undo all the steps.
- **Atomic:** all or nothing.

**Lock:** a database feature that makes other requests wait until the current one finishes.
**Row-level lock:** locks one row, not the whole table. Tixbook locks the event row.
**SELECT ... FOR UPDATE:** the Postgres SQL that locks the rows it reads until the
transaction ends.

**Pessimistic locking:** lock first, then work. Assumes a clash will happen. Others wait.
Safe and clear, but people queue, and it can cause deadlocks.

**Optimistic locking:** no lock. Work freely, then check at save time that nobody else changed
the data. Uses a version number. If the version changed, the save fails and you retry.
Fast when clashes are rare, wasteful when many people fight over the same row.

**Version column:** a number on a row that goes up on every update. Optimistic locking saves
"only if the version is still N".

**Deadlock:** two transactions each hold a lock the other needs, so both wait forever.
Postgres cancels one. Avoid it by locking in a consistent order and keeping transactions short.

**Seat hold:** a Booking row with status HELD and an expiresAt time. It reserves one place
while the user pays. It's data, not a lock.

**TTL (time to live) / expiry:** how long something stays valid. Tixbook hold = 5 minutes.

**Cron job:** code that runs on a schedule. Tixbook: marks expired HELD bookings as EXPIRED.

**409 Conflict:** the HTTP status for "your request clashes with the current state",
e.g. sold out.

### Tixbook's approach
Pessimistic lock on the event row for milliseconds, to count places and create a HELD row.
Then release the lock. The user pays within 5 minutes with no lock held.
Paid → CONFIRMED. Not paid → cron marks it EXPIRED and the place is free again.

### Why not optimistic?
Everyone fights over the same event row (high contention), so most optimistic saves would
fail and retry. Optimistic suits rare clashes or separate rows (e.g. assigned seats A5 vs B7).
Plan: build both in phase 4 and measure.
## Deadlocks: how Tixbook avoids them (11 Nov 2026)

**Deadlock:** two requests each hold a lock and wait for the other's lock.
Neither can move. It's a circle of waiting.

**Example:**
- Asha locks event e1, then wants e2
- Rahul locks event e2, then wants e1
- Asha waits for Rahul, Rahul waits for Asha → stuck forever

### How Tixbook avoids it
1. **One lock per booking.** Each booking locks only one event row. With one lock,
   people wait in a line, and a line can't become a circle.
2. **Short lock.** Inside the lock we only count places and insert the HELD row.
   No Stripe call, no email, no waiting for the user.
3. **Same order.** If we ever lock more than one row (e.g. a cart), always lock in the
   same order (sorted by id). Then nobody can hold e2 while waiting for e1.
4. **Safety net.** Postgres detects deadlocks and cancels one request with an error.
   A lock timeout (lock_timeout) stops a request waiting too long. Check the Postgres
   docs when building.

### Honest note
This makes deadlocks very unlikely, not impossible. Phase 4: cause one on purpose
and watch what Postgres does.

## Separate dev and production databases (14 Nov 2026)

- Before: my laptop and Render used the same database, so local experiments hit the live site.
- Now: Neon branch `production` = live (Render), Neon branch `dev` = my laptop.
- A Neon branch = a copy of the database at that moment, with its own connection string
  and its own host (`ep-...`).
- How I proved it: changed an event title in dev with Prisma Studio. The local API showed the
  change, the live API didn't.
- How to check which database I'm on: `npx prisma migrate status --config prisma7.config.ts`
  prints the host; match it in Neon → Branches → Computes.
- Env files are only read at startup: restart the API after changing `.env`.
## Safe seed: transaction + guard (14 Nov 2026)

- Wrapped the whole seed in `prisma.$transaction(async (tx) => { ... })`.
  Inside, every query uses `tx`, not `prisma`.
- If anything throws inside, every step is rolled back. Tested by throwing an error
  right after the deletes: the old data was still there.
- Transaction options: `maxWait` = how long to wait to START (default 2s),
  `timeout` = how long it may RUN (default 5s). Raised both for the seed
  (Neon may be waking up; ~15 queries over the network).
- Guard: the seed refuses to run unless the DATABASE_URL host equals SEED_ALLOWED_HOST.
  Tested with a wrong value: it refused before touching anything.
- Replaced faker Latin with real descriptions; `\n\n` shows as a new paragraph
  because the detail page uses `whitespace-pre-line`.

**What I learned:** a transaction makes the seed all-or-nothing, but it doesn't make it safe
to run on production. That's why the guard exists too.
##  SQL on production (14 Nov 2026)

- Used Neon's SQL Editor on the `production` branch to fix 6 descriptions once,
  without putting production's secret on my laptop.
- SELECT first to check which database I'm on, then UPDATE ... WHERE, then SELECT again.
- `"Event"` needs double quotes (capital letter); `$$ ... $$` = text with apostrophes and line breaks.
- An UPDATE without WHERE changes every row.
- BEGIN ... COMMIT = the same all-or-nothing transaction idea as the seed.
## Vercel rewrite (15 Nov)
- A rewrite means Vercel fetches a page from another server and sends it back under my own URL. The browser never sees the other server.
- A redirect is different: it tells the browser to go to a new URL, so the URL changes.
- `/api/:path*` matches everything after /api/ and sends it to Render.
- Why I need it: in the next part of phase 2 my API will set a login cookie. If the browser called onrender.com directly, that cookie would come from a different site, and Safari may block it. Through the rewrite it's a vercel.app cookie.
- Tested: tix-book.vercel.app/api/v1/events shows my events.
- Not tested yet: the cookie part. I'll check it once login works.
## Session table (15 Nov)
- A session = one row in the Session table that says "this user is logged in until this time".
- The `id` is a hash of the session token, not the token itself. The real token only lives in the user's cookie. If someone steals the database, the hashes can't be used as cookies.
- `onDelete: Cascade`: if a user is deleted, their sessions are deleted too.
- `@@index([userId])`: makes "find all sessions for this user" fast (needed for "log out everywhere").
- `migrate dev` wrote the SQL into a migration file and ran it on my dev database. Production gets it later with `migrate deploy`.
- Line endings: Windows uses CRLF, the repo uses LF. Git warnings about this are harmless; if only line endings changed, Git doesn't commit the file.

## Sign-up and password hashing (15 Nov)
- Never store a password. Store a hash: a one-way scramble. On login, I hash what the user types and compare.
- Salt: random bytes added to each password before hashing, so two users with the same password get different hashes. Argon2 makes the salt for me and stores it inside the hash string.
- The hash string holds everything: `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`.
- Argon2id is slow on purpose and uses memory (19 MiB per hash), so guessing millions of passwords is expensive. OWASP's first choice.
- I lowercase emails so `Apra@x.com` and `apra@x.com` are one account.
- 409 Conflict = the request is valid, but it clashes with data that already exists (email taken).
- I catch Prisma's `P2002` error instead of checking "does this email exist?" first. Two sign-ups at the same moment could both pass a check; the database's unique rule can't be beaten. Same idea as race conditions in phase 4.
- The API never sends `passwordHash` back (`select` only safe fields).
- Tests: 201 on success, 409 on a duplicate email (even in capitals), 400 on bad input.
## Login and session cookies (15 Nov)
- Login: find the user by email, check the password with Argon2, create a Session row, send the token in a cookie.
- Session token: 32 random bytes. The cookie holds the token; the database holds its SHA-256 hash.
- Two kinds of hash: Argon2 (slow) for passwords, because people pick guessable ones. SHA-256 (fast) for tokens, because 256 random bits can't be guessed.
- 401 = "I don't know who you are". 403 = "I know who you are, but you're not allowed" (coming in 2b).
- Same error for wrong email and wrong password, so attackers can't find out who has an account. A dummy hash makes both take the same time.
- Cookie flags:
  - httpOnly: browser JavaScript can't read it (protects against XSS stealing it).
  - Secure: only sent over HTTPS.
  - SameSite=Lax: not sent on most requests from other sites (helps against CSRF).
- Tests check the cookie flags, and that the database stores the hash, not the token.

## /me and logout (15 Nov)
- /me reads the session cookie, hashes the token, looks it up in the Session table, and returns the user, or 401.
- cookie-parser: Express can set cookies on its own but needs this middleware to read them (fills `req.cookies`).
- Expired session: return 401, delete the row, clear the cookie.
- Logout: delete the session row, then clear the cookie. The browser only clears it if path and flags match the original.
- 204 No Content = it worked, nothing to send back.
- Revocation: after logout, the same cookie gets 401, because the row is gone. A JWT can't do this without extra server state. This is why I chose sessions (DECISIONS 023).
- Cookie values can be anything, so I check `typeof token === "string"` before using it.
## Roles and protected routes (15 Nov)
- Middleware: a function that runs before the route. It either stops the request (401/403) or calls next() to continue. They run in the order listed: requireAuth, requireRole, then the handler.
- requireAuth: reads the cookie, finds the session, stores the user in res.locals, or returns 401.
- requireRole("ORGANISER"): returns 403 if the logged-in user has a different role.
- 401 = I don't know who you are. 403 = I know who you are, but you're not allowed.
- Auth runs before validation, so strangers don't learn my field rules.
- The organiser comes from the session, never from the request body. Zod drops unknown fields like organiserId. This closed decision 014.
- /me now reuses requireAuth, so "who is this?" lives in one place.
## 2026-11-15 — Login pages and header login state (phase 2c)

**What I built:** /signup, /login and /account pages, and a header that shows
"Log in" or "Hi, name" with a Log out button.

**How the header knows who I am:** a Server Component reads the session cookie
and calls the API's /me. It forwards the cookie by hand, because a
server-to-server fetch doesn't send the browser's cookies automatically.

**Key rules I learned:**
- With Cache Components on, reading cookies() outside <Suspense> is a build error.
  So the header's user part has its own Suspense, and the rest of the page doesn't wait.
- Forms call "/api/..." (a relative URL), so they go through the Vercel rewrite and
  the cookie is first-party.
- After login, router.refresh() is needed: the layout (header) doesn't re-render
  on navigation by itself.
- redirect("/login") throws to stop rendering, so code after it never runs.
- The rewrite now points at API_URL, so local log-ins hit my local API, not production.

**Trade-off:** checking on the server means one extra API call per page,
but there's no "Log in" flash before "Hi, name".

## 2026-11-16 — Forms kept old values after navigating away (bug #27)

**The bug:** after logging out and opening /login again, the form still showed my old
email, password and the old "Invalid email or password" error.

**Why:** with `cacheComponents: true`, Next.js 16 doesn't remove a page when you
leave it. It hides it with React's `<Activity>` (up to 3 pages), so input values
and useState are kept.

**Fix:** a `useLayoutEffect` cleanup runs when the page is hidden. It calls
`form.reset()` and clears the message, field errors and `pending`.

**Mistake on the way:** the first version forgot `ref={formRef}` on the `<form>`.
The code compiled and the tests passed, because nothing checked the real behaviour.
I added a test that hides and shows the form with `<Activity>` and checks the
inputs are empty. It fails without the ref.

**Lesson:** a test should check what the user sees, not just that the code runs.
Keeping state is good for drafts, bad for passwords.
## 2026-11-17 — Google login (OAuth 2.0 / OpenID Connect)

**The flow:** button → our API → Google → back to our callback with a one-time `code`
→ API swaps the code (+ secret) for tokens → reads the ID token (who you are)
→ find or create user → normal session cookie.

**state:** random value in a cookie and in the URL. If they don't match on the way
back, someone else started this login (CSRF). Reject.

**PKCE (code verifier):** we keep a secret, send Google only its hash. When swapping
the code we prove we have the original, so a stolen code is useless.

**OAuth vs OIDC:** OAuth = permission to access an API. OIDC adds the ID token =
who the user is. "Sign in with Google" is OIDC.

**Pre-account hijacking:** never auto-link a social login to an account whose email
wasn't verified.

**Small lessons:** the Google button is a plain `<a>`, not `<Link>`, because it's a full
page load to the API. Testing mode = only listed test users can sign in.
Chrome's autofill (blue fields, key icon) is the browser, not my app.

## 2026-11-17 — CORS vs CSRF

**CORS** = a browser rule about whether JavaScript on site A may *read* a response
from site B. Our browser only talks to our own domain (rewrite), so we need none.

**CSRF** = another site makes *your* browser send a request to us, with your cookie,
to change something (e.g. a hidden form that POSTs). CORS doesn't stop the request
being sent; it only stops reading the answer.

**My defences:** SameSite=Lax cookie, JSON-only API, GET never changes data,
`state` in Google login, and a Sec-Fetch-Site check that blocks cross-site writes.

"CORS protects reading; CSRF is about sending. I don't need a
CSRF token because of SameSite=Lax plus a Fetch Metadata check."

## 2026-11-17 — Phase 3a: Find events

**One error format:** routes `throw new HttpError(status, message)`; one error handler
turns it into `{ error, details? }`. Bugs only ever show "Something went wrong".
Lesson: different messages for different 404s ("Not found" vs "Event not found")
told me which code answered when a test failed.

**Cursor pagination:** the API sends 12 events + a cursor (last event's startsAt + id).
Next page = "events after this one" (keyset). Stable when events are added or removed;
offset (`?page=2`) can show duplicates or skip items. Fetch 13 to know if there's more.

**Transaction:** sign-up saves the user AND the session in `prisma.$transaction`:
both or neither. Inside, use `tx`, not `prisma`.

**Search in the URL:** filters change the URL; the server page re-renders. Shareable,
survives refresh.

**Race conditions:** debounce typing (300 ms); each keystroke's effect cleanup cancels
the old timer. "Load more" uses AbortController and is cancelled on unmount, so a late
answer can't add old results to a new list. A `key` from the filters gives a fresh list.

## 2026-11-18 — Phase 3b: UI kit, `<dialog>` and live regions

**Native `<dialog>` (Modal):** `dialog.showModal()` gives me, from the browser:
- a focus trap: the rest of the page becomes inert, so Tab can't leave the dialog
- Escape to close (the browser fires `cancel`, then `close`)
- focus moves into the dialog on open, and back to the opening button on close
- the "top layer": always on top, no z-index; style the dark background with `::backdrop`

**Keeping React and the dialog in sync (both ways):**
- Prop → dialog: an effect calls `showModal()` when `open` is true and `close()`
  when it's false. Check `dialog.open` first (`showModal()` on an open dialog throws).
- Dialog → prop: Escape closes the dialog without React knowing. The `close` event
  calls `onClose()` so the parent sets `open` to false.
- Without the second part, the parent still thinks it's open, `setOpen(true)` changes
  nothing, and the modal can never open again. My test presses Escape, then opens it again.
- Tailwind's reset removes the browser's centring margin, so the dialog needs `m-auto`.

**Testing `<dialog>`:** jsdom has no `showModal()`, `close()` or Escape behaviour.
`jest.setup.ts` adds a small stand-in. So Jest tests check my wiring; the real focus
trap must be checked in a browser (and later in Playwright).

**Live regions (Toast):**
- A live region (`role="status"` or `role="alert"`) tells screen readers "read changes
  in here out loud". `status` = polite (waits for a pause). `alert` = interrupts.
- The region must be in the page BEFORE the message arrives. A region added together
  with its text is often not read. So both toast regions are always rendered, empty.
- `role="status"` and `role="alert"` default to `aria-atomic="true"`: read the WHOLE
  region on any change. With two toasts, the old one is read again. `aria-atomic="false"`
  reads only the new one.
- Focus never moves to a toast. It pauses while hovered or focused (WCAG 2.2.1),
  and important errors still go next to the form field.

**Form ids:** `useId()` instead of `id={name}`. Hidden pages stay in the DOM (`<Activity>`),
so the login and sign-up pages both had `id="email"`.

**Tests that prove something:** I broke the code on purpose to check each important test
fails. The first re-render test used `<Profiler>`, and it passed even when the bug was
there: Profiler didn't report the re-render. A plain `jest.fn()` called during render
caught it. Lesson: a test that never failed hasn't proved anything yet.

**Interview lines:**
- "I used the native dialog with showModal(), so the browser gives me the focus trap,
  Escape and focus return."
- "A live region has to exist before its content changes, so the toast container is
  always rendered, even when empty."
- "The context holds a stable function, not changing state, so the components that use
  it don't re-render."

## 2026-11-22 — My events API, PATCH and IDOR

**IDOR (Insecure Direct Object Reference):** the id comes from the URL, so anyone can
send any id. If the server only checks "are you logged in as an organiser?", any
organiser can edit any event just by changing the id. Fix: load the row and compare
its owner with the session user, every time.

**The order of checks in PATCH:** 401 (who are you?) → 403 (organiser?) → 404 (your
event?) → 400 (valid data?) → update. Ownership comes before validation, so someone
else's event never gives away our rules in a 400.

**404, not 403, for someone else's event (decision 032):** a 403 says "it exists".
The test checks that "not yours" and "unknown id" return exactly the same body.

**Defence in depth:** the update also has `where: { id, organiserId }`. Our Prisma (7.10.1)
allows a non-unique field next to `id` there (checked in the generated types). If nothing
matches, it throws `P2025` (Prisma docs). A test runs that on the real database.

**Partial updates (PATCH):**
- `eventFields.partial()` = every field optional; send only what changed.
- Rules between fields can't be checked on the patch alone: a new `endsAt` needs the
  saved `startsAt`. So: merge the saved row with the changes, then check the rules.
- `null` means "clear this field" (switching to online clears the venue). Missing means
  "don't change". JSON can't send `undefined`, so `null` is how you clear something.
- Zod drops unknown fields, so `organiserId` in the body can't move the event.

**Express gotchas:**
- Route order: `/mine` must be declared before `/:id`, or `/:id` catches it with
  id = "mine".
- After middleware, `req.params.id` is typed `string | string[] | undefined`, so the
  ownership helper checks `typeof id === "string"` at runtime.

**Testing lesson again:** I broke the ownership check and the merged-rules check on purpose.
Both made tests fail, so the tests really protect them.

**Interview lines:**
- "IDOR is trusting an id from the client. I load the row and compare its owner with the
  session user, in one shared function."
- "For a partial update I merge the patch with the saved row and validate the result,
  because rules that compare fields need both."

## 2026-11-22 — My events page, edit form, and checking it in a real browser

**One form, two modes:** `EventForm` creates (POST) when it gets no event, and edits
(PATCH) when it gets one. Same fields and rules; edit mode adds a Status select,
pre-filled `defaultValue`s and Cancel. `form.reset()` goes back to the defaultValues,
which in edit mode is the saved event.

**Times and time zones:** `<input type="datetime-local">` has no time zone. The browser
reads it in ITS OWN zone, so the form shows and saves times in the browser's zone (not
the event's `timezone` field). `toDateTimeLocal()` turns the saved UTC time into local
"YYYY-MM-DDTHH:mm" (not `toISOString().slice(0, 16)`, which would show UTC).
Known limit: an organiser travelling abroad sees the form in their current zone, while
"My events" shows the event's own zone.

**Testing time zones in Jest:** changing `process.env.TZ` inside a test does nothing:
each test file gets its own copy of `process.env`. Set it once in `jest.config.ts`
(before the workers start). My first London tests only passed because my laptop is in
the UK: they would have failed on a computer anywhere else.

**Always-present live regions vs tests:** the toast's empty `role="alert"` region is
always in the page, so `findByRole("alert")` found it instead of the form's error.
Fix: find the message by its text, then check its role.

**Server-side calls as the user:** `lib/server-api.ts` forwards the `session` cookie by
hand (server-to-server fetch doesn't send the browser's cookies). `notFound()` shows the
same page for "doesn't exist" and "not yours" (the API answers 404 for both).

**Next.js route types:** `PageProps<"/events/[id]/edit">` failed type-checking until
`npx next typegen` ran: route types are generated from the `app/` folder by
`next dev`, `next build` or `next typegen`.

**Real-browser check of the Modal (things jsdom can't do):**
- Opening: focus moves into the dialog (onto the × button), `:modal` matches.
- Tab six times: focus cycled through the dialog's 3 buttons, never the page behind it.
- Escape: closes, focus returns to the Cancel button, typed changes are kept.
- Opens again after Escape (the prop ↔ dialog sync works in a real browser too).
- Save: PATCH → "Event updated" toast still showing on /my-events.

**Git lesson:** `git add` with one wrong path adds NOTHING, so a commit got the renames
but not the edits. Always read `git status` before committing: `RM` / ` M` meant
"staged rename, unstaged changes".

**Interview lines:**
- "datetime-local has no time zone; the browser uses its own, so I convert in the
  browser's zone in both directions and test it with a pinned TZ."
- "I check the focus trap in a real browser, because jsdom doesn't implement dialog."

## 2026-11-22 — Seats left, responsive pass, Playwright and axe

**N+1 queries:** one query for the list, then one more per event = N+1 queries. Instead,
one `groupBy` adds up the booked seats for every event on the page at once: 2 queries
in total, whatever the page size.

**One calculation, used everywhere:** `api/src/lib/seats.ts` is the only place that decides
what "taken" means (confirmed + holds that haven't expired, adding up `seats`). The list
and the event page both call it, so they can't disagree. A test with a 2-seat booking and
an expired hold proves it; it fails if expired holds are counted.

**Responsive pass:** I measured each page at 375, 768 and 1280px with a small script
(is the page wider than the screen? which elements stick out?). Found two problems:
- the organiser header was too wide on a phone (sideways scrolling, "Log out" cut off).
  Fix: `flex-wrap` on the header, `whitespace-nowrap` on the items, `truncate` on the name.
- an invisible "Clear" button left an empty gap on phones. `visibility: hidden` keeps the
  space (good on desktop: no jump), `display: none` removes it (better on a phone).

**Playwright:** a real browser against the real app. `webServer` starts (or reuses) the
API and the web app. Lessons:
- Strict mode: a locator must match exactly one element, and hidden elements count.
  The page I came from is still in the DOM (`<Activity>`), so I scope locators
  (e.g. inside the "Tickets" box).
- A cold dev server compiles each page on the first visit, so assertions get 15 seconds.

**axe:** the engine behind axe DevTools, run by `@axe-core/playwright` on 9 pages
against WCAG 2.2 A + AA. No violations. To prove the check works, I broke a label on
purpose: axe reported "label (critical): Form elements must have labels".
Automated checks only find part of the problems, so I also did a keyboard pass by hand.

**Debugging my own tools:** twice my measurements were wrong, not the app: a script
measured a hidden copy of the page, and a focus recorder missed events. Lesson: when a
result looks surprising, check the measurement before "fixing" the code.

**Interview lines:**
- "N+1 means one query per row. I load the counts for the whole page in one grouped query."
- "I keep one function for seats left, so two pages can never show different numbers."
- "axe finds the mechanical problems; a keyboard pass finds the rest."

## 2026-11-22 — Phase 4a: holding seats without selling them twice

**The race condition, for real:** without a lock, 10 people asking for 2 seats each at the
same moment on a 5-seat event got 5 bookings: 10 seats sold for 5 places. Every request
counted "5 left" before any of them had saved anything.

**The fix: `SELECT ... FOR UPDATE` on the event row** (decision 034). The first booking
locks the row; the others wait in a queue until it commits, then count again. Inside the
lock the count can't change. Prisma has no FOR UPDATE, so it's raw SQL with a tagged
template: `${eventId}` is sent as a parameter, never pasted into the SQL (no injection).

**Read the clock after the lock:** bookings and confirms for one event take the same lock
and only then read `now`, so time moves forward in the order they ran. Otherwise a confirm
could count a hold as "still running" while a new booking already counted it as "expired".

**Idempotency in two layers:** first "have I seen this key?" (fast path), then the
database's unique constraint for the case where two identical requests arrive at the same
moment and both pass the check. The loser catches `P2002` and returns the winner's booking.
Same key, different request → 422 (a client bug).

**No cron job** (decision 035): seats left already ignores holds that ran out, so the
stored status is only tidied up when someone looks (lazy expiry). Render sleeps anyway,
and a cron every minute would keep Neon awake all month.

**Transactions and the connection pool:** each waiting booking holds a database connection
(pool of 10). Prisma's defaults (2s to start, 5s to run) were too short for 20 bookings at
once, so booking transactions get 10s.

**Interview lines:**
- "I lock the event row with SELECT FOR UPDATE, count inside the lock, and insert, so two
  requests can't both see the last seat. A test with 20 parallel requests proves it, and
  fails when I remove the lock."
- "Idempotency: a key from the client plus a unique constraint, so retries and double
  clicks give one booking even when they arrive at the same moment."

## 2026-11-22 — Phase 4b: optimistic vs pessimistic, measured, and a real deadlock

**Optimistic locking:** don't lock while reading; remember a version (here the event's
`updatedAt`), and save with `updateMany(where: { id, updatedAt: version })`. 0 rows updated =
someone else changed it first → roll back and retry after a short random wait (so the
requests that clashed don't all retry at the same moment). Removing the version check sold
13 seats for 5 places, so the check is what makes it safe.

**What the numbers showed** (DECISIONS 038): with most requests refused, optimistic was faster
(refused requests stop early; with a lock they queue). With room for everyone, optimistic was
almost 2x slower with ~260 retries for 40 bookings: each success makes everyone else's read
out of date. Lesson: "optimistic is faster" is only true when conflicts are rare.

**Deadlock:** A locks event 1, B locks event 2, then A wants 2 and B wants 1: each waits for
the other forever. Postgres checks for this after about a second and cancels one:
`Raw query failed. Code: 40P01. Message: deadlock detected`. The fix is a fixed lock order
(sorted ids): then the second transaction just waits in line.

**A test that passed for the wrong reason:** my first deadlock test passed "both finished"
because the two transactions never overlapped (starting a transaction over the network took
longer than my 500 ms wait). I fixed it by waiting until both held their first lock.

**Interview lines:**
- "I measured both. Optimistic wins when most requests fail early; with many successes at
  once it retries so much it's twice as slow, so I kept the row lock."
- "Deadlocks come from taking locks in different orders. Postgres detects them and cancels
  one; I avoid them by locking in a fixed order."

## 2026-11-23 — Phase 4c: the booking UI, and an invisible dialog

**Countdown from the server's clock:** the API sends `serverTime`. The countdown starts at
`holdExpiresAt − serverTime` (the same value on the server and in the browser, so no
hydration mismatch), then only measures how much time has passed in the browser. A wrong
clock on the user's computer doesn't matter. The "page loaded at" time lives in a ref, so
hiding and showing the page (`<Activity>`) doesn't restart it from 5:00.

**Accessible countdown:** `role="timer"` isn't read out every second; a polite status says
"Less than a minute left" once.

**Idempotency in the UI:** one key per dialog, made when it opens, sent with every try. A
double click or a retry after a network error is one booking; a new dialog = a new key.

**The bug: "Confirm booking" did nothing.** Next.js hides the page you leave instead of
removing it. The "Book tickets" dialog was opened with `showModal()` and was still modal on
the hidden page: 0px tall, invisible, but a modal dialog makes the rest of the document
inert, so no click reached the new page. Found by checking `dialog.matches(':modal')` and
`document.elementFromPoint` in the real browser. Fix: the Modal closes its dialog in an
effect cleanup (Activity runs cleanups when it hides a page), and the booking dialog closes
before navigating. jsdom tests didn't catch it at first because nothing hid the page; the
new test wraps the modal in `<Activity>` and hides it.

**Interview lines:**
- "The countdown uses the server's time and only measures elapsed time locally, so it
  can't be fooled by the user's clock."
- "A modal dialog makes everything else inert. With pages kept alive but hidden, a modal
  left open on the old page blocked the new one; closing it in the effect cleanup fixed it."

## 2026-11-23 — Phase 4d: My tickets, and what end-to-end tests caught

**End-to-end booking flow (Playwright):** an organiser creates a paid event through the API
(`request` fixture), and the browser page is the attendee: book 2 seats → countdown →
confirm → the ticket on My tickets. A second test uses another request context as "someone
else" who holds the only seat first. Shared helpers live in `e2e/helpers.ts`.

**The bug it found:** after a 409 the page refreshes the seat count. When that made the
event sold out, the booking panel returned only the "Sold out" button and the dialog (with
the "someone else got the last seats" message) vanished the moment it appeared. Unit tests
didn't see it because nothing re-rendered with 0 seats. Fix: only the trigger button
changes; the dialog stays until the user closes it. New unit test: re-render to 0 seats,
the message stays.

**Lesson (twice in phase 4):** Next.js keeps hidden pages and refreshes server data under a
Client Component. Both bugs only appeared when something outside the component changed
(a hidden page, new props after a refresh). End-to-end tests and real-browser checks find
these; component tests with fixed props don't.

**axe on the booking pages:** the dialog, the held booking (with the live countdown), the
confirmed booking and My tickets: no violations.

**Interview lines:**
- "My end-to-end tests drive two users at once, so I can test 'someone else got the last
  seat' for real, and that test found a bug unit tests couldn't."
- "When a parent re-renders with new data, a component that returns early can unmount
  things the user is still reading; I only swap what has to change."

## 2026-11-22 — Phase 5a: Stripe Checkout and webhooks

**Stripe Checkout:** the API creates a Checkout Session (price and seats from our database,
never from the browser) and the browser goes to Stripe's page. Card details never touch our
servers.

**Webhooks:** Stripe calls our API (`POST /api/v1/payments/webhook`) when the payment
succeeds. The booking is confirmed there, not when the browser comes back to the success
URL: anyone can open that URL, and a user can close the tab before it loads.

**Signature check:** Stripe signs each webhook with an HMAC of the exact body bytes. It
needs the raw body, so the route is mounted before `express.json()`. Removing the check on
purpose failed the "wrong secret" test.

**Duplicates:** the same event can arrive twice, even at the same moment. An event-id table
skips repeats, but the real protection is storing the payment id on the booking under the
event lock (decision 042). With that check removed, the "two copies at once" test failed.

**Paying late (decision 041):** Stripe's page stays open for at least 30 minutes, the hold
for 5. A late payment is confirmed if the seats are still free, otherwise refunded. The
refund uses the payment id as Stripe's idempotency key, so retries refund once.

**Mistake on the way:** Windows PowerShell 5.1 saved the migration file with an invisible
byte-order mark, and Postgres failed with `syntax error at or near "\u{feff}"`. Nothing was
applied (it failed on the first character); removing the 3 bytes fixed it.

**Interview lines:**
- "I never trust the redirect: the booking is confirmed by a signed webhook, and the webhook
  handler is idempotent because Stripe delivers at least once."
- "A payment can arrive after the seat hold ends; I re-check seats under the same row lock
  and refund automatically if they're gone."

## 2026-11-23 — Phase 5b: paying in the web app

**Checked first:** the Stripe SDK (23.2.0) pins API version `2026-11-18.endive`, the same
version as the webhook endpoint in the Stripe dashboard, so the event's `data.object` has
the shape our code reads. Then a real payment, locally: hold 2 seats → Stripe's test page →
card 4242 4242 4242 4242 → `stripe listen` forwarded `checkout.session.completed` → the
booking became CONFIRMED with the payment id saved. Nothing else could have confirmed it,
because the stand-in confirm wasn't called.

**Never trust the redirect:** `?payment=success` only means the browser came back. The page
says "confirming" and asks the API every 2 s until the webhook has changed the booking.
Breaking this on purpose (show Confirmed from the URL) failed 4 tests.

**Polling without leaks:** the next request starts only after the last answer, and the
effect cleanup aborts the request and clears the timer. Removing the cleanup failed
"stops asking when the page goes away". The callback is kept in a ref, so a new function
from the parent doesn't restart the polling (the stale-closure problem, from the other
side).

**End-to-end without Stripe's UI (decision 045):** the test clicks Pay, checks it reached
checkout.stripe.com, then signs a webhook itself the way Stripe does (HMAC-SHA256 of
`timestamp.body`).

**Small things:**
- jsdom won't let a test spy on `window.location.assign`, so the redirect lives in a
  one-line module (`lib/navigate.ts`) that tests replace.
- `findByRole("alert")` found the toast area's empty alert region first; finding the
  message by its text fixed the test.
- `tsx watch` started by another program never starts the server (already noted in the
  Playwright config); stopping `npm` also left the `tsx` child holding port 4000.

**Interview lines:**
- "The success page is not proof of payment. My page waits for the server, which only
  trusts Stripe's signed webhook."
- "I poll with a cleanup that aborts the request and clears the timer, so leaving the page
  can't leave requests running."

## 2026-11-23 — Phase 5c: the ticket QR code is a signed JWT

**JWT in practice:** three base64url parts, `header.payload.signature`. The payload is
readable by anyone, so it holds ids only. The signature is an HMAC of the first two parts
with our secret, so changing the seats from 2 to 10 breaks it (a test does exactly that).

**What the verifier must pin:** the algorithm (HS256 only; an `alg: none` token is
refused), the issuer and the audience (a token signed for something else with the same
secret isn't a ticket), and the expiry.

**Revocation:** a JWT can't be taken back. A ticket for a refunded booking still has a
perfect signature, so the door check also asks the database. Removing that check failed
the "refunded since" test.

**Tests broken on purpose:** decoding without checking the signature failed 3 tests
(different secret, wrong audience, alg none); no database check failed 1; no audience
check failed 1.

**My mistake:** I backed up `lib/tickets.ts` and `routes/tickets.ts` into one folder.
Same file name, so the second copy was refused, and "restoring" after break 2 copied
the lib file over the route file. The next run failed to start, which is how I noticed.
I rewrote the route file from the version I had written and re-ran break 3. Lesson: give
backups unique names, and check that restoring worked (`cmp`) before trusting the next
result.

**Jest environments:** the QR helper runs on the server, and jsdom has no `TextEncoder`,
so its test file runs in Node (`@jest-environment node`). The shared setup file assumed a
browser (`HTMLDialogElement`) and now skips that part when there's no DOM.

**Interview lines:**
- "My tickets are signed JWTs: the signature proves we issued them, and because a JWT
  can't be revoked, the door check also asks the database whether the booking is still
  confirmed."
- "A verifier must pin the algorithm, issuer and audience, or a token made for something
  else could be accepted."

## 2026-11-23 — Phase 5d: the organiser dashboard

**One rule, one query:** the dashboard's confirmed / held / left numbers come from the same
"taken" rule as seats left, grouped by event, status and price in one query for the whole
list. No N+1, and the dashboard can't disagree with the public page.

**A test that passed for the wrong reason (again):** I broke the count on purpose (count
every HELD row) and all tests still passed, because the dashboard route saves EXPIRED first.
The My events list doesn't, so the bug was real there. A new test with a run-out hold that
is still stored as HELD fails on the broken code. Breaking code on purpose is how I found
the gap.

**Privacy:** attendees are shown by name only. A test checks that no email, key or payment
id is in the response, and adding the email on purpose failed it.

**Accessible table:** a real `<table>` with a caption and column headers, status as text in
the badge (a test removes the text and fails). On a phone the table scrolls inside its own
box, which can take keyboard focus; the e2e test checks at 375 px that the page itself
never scrolls sideways. The jsx-a11y rule against `tabIndex` on non-interactive elements is
turned off for that one line, with the reason (axe's "scrollable-region-focusable" asks for
it).

**Next.js route types:** `PageProps<"/my-events/[id]">` failed type-checking until the route
types were generated again (`npx next typegen`); `next dev` and `next build` do this
automatically.

**Interview lines:**
- "Every seat number in the app comes from one function, so the organiser's dashboard and
  the public page can't disagree."
- "Organisers see attendee names, not emails: they don't need them to run the event."

## 2026-11-23 — Phase 6a: sending email safely

**An interface, not a vendor:** the app calls `sendEmail(message)`. Behind it is an
`EmailSender`: the real one calls Resend's HTTP API with `fetch`, tests use a fake that only
records messages. Tests never send email and need no key.

**Two kinds of failure:** a timeout or a 5xx might work next time (retryable); a 422 or a
bad key never will (permanent). Sorting them now means the queue in 6b retries only what can
succeed. A quota that's used up (429 daily quota) is permanent too: it resets at midnight.

**Idempotency again:** each email has a key like `booking-confirmed/<bookingId>`. Resend
remembers it for 24 hours, so if a send times out and we retry, the attendee still gets one
email.

**Sandbox mode:** without a domain, Resend delivers only to my own address. The allowlist
makes that explicit: anyone else is skipped and logged, never an error. Unset means nobody.

**Escaping:** event titles come from organisers. `<script>` or `<a href>` in a title would
become real HTML in the email, so every value is escaped. Breaking `escapeHtml` on purpose
failed 2 tests; so did letting everyone through the sandbox.

**Small surprise:** Node formats en-GB dates as "Saturday, 5 December" (with a comma). My
first test expected no comma; the test was wrong, not the code.

**Interview lines:**
- "I depend on an interface, not a vendor, so tests never send real email and swapping
  providers changes one file."
- "I only retry errors that can succeed on a retry, and the idempotency key makes the retry
  safe."

**A test that passed for the wrong reason (time zones):** my laptop is in Europe/London, so
a date formatted with the server's zone by mistake still looked right. I broke it on purpose
and the test passed. Setting `process.env.TZ` inside a test file doesn't help: Jest runs each
file in a sandbox with its own copy of `process.env`. Fix: `jest.global-setup.js` sets
`TZ=UTC` once, in the main process, before any test runs, so every API test runs like
Render. Now the broken version fails 2 tests.

**First real email (23 Nov):** `npm run email:test` sent one email through Resend. It arrived
in the inbox, not spam, and `<check escaping>` showed as text. The link was rewritten
through resend-clicks.com (click tracking), which we can't turn off without our own
domain (decision 049).

**Interview line:** "My tests run in UTC like the server, so a time zone bug can't hide
behind my laptop's settings."

## 2026-11-23 — Phase 6b: a job queue for the confirmation email

**A queue:** the booking doesn't send the email. It saves a small job row; a worker in
the same API process picks it up a few seconds later. If Resend is slow or down, the
booking doesn't notice.

**Same transaction (outbox idea):** the job is saved with the transaction that confirms
the booking, through pg-boss's `fromPrisma(tx)` adapter. A test throws after saving the
job: the rollback removes it. Breaking this on purpose (saving with pg-boss's own
connection) failed that test.

**Retries, backoff, dead letter queue:** retryable errors are tried 6 times in all, with
waits that double (30 s, 1 min, 2 min...). A permanent error goes straight to the dead
letter queue. Tested with a real worker and 1-2 s delays: 3 tries then dead-lettered;
a permanent error tried once; fail once then completed. Breaking the sorting on purpose
failed 2 tests.

**A pg-boss rule I hit:** `retryDelayMax` is only allowed with `retryBackoff: true`. My
first test turned backoff off and createQueue refused it. Fix: keep backoff on in the
test, with tiny delays, so the test also runs the real backoff path.

**A startup bug I found:** run from the repo root, the API couldn't start: dotenv reads
`.env` from the current folder, so DATABASE_URL was empty, and pg failed with "client
password must be a string". Prisma connects lazily, so this never showed before; pg-boss
connects at startup. Now startJobs() says plainly that DATABASE_URL is missing.

**My own mistake:** a "break it on purpose" script restored files with `git checkout`,
which also threw away my uncommitted change to payments.ts. I re-applied it and re-ran
everything. Lesson: restore from a copy, or commit first.

**Manual check (dev):** booked a free event through the running API as a throwaway test
user; the worker logged `skipped: sandbox (booking-confirmed/<id>)` a few seconds later.
Test data and the job were deleted afterwards.

**Interview lines:**
- "The job is written in the same transaction as the booking, so there's never a
  confirmed booking without its email, or an email for a booking that rolled back."
- "I only retry errors that can succeed on a retry; the rest go straight to a dead
  letter queue."

## 2026-11-23 — Phase 6c: reminder emails, and waking a sleeping server

**Delayed jobs:** `startAfter` keeps a job in the queue until a time. The reminder is
saved when the booking is confirmed, due 24 hours before the event.

**Check at run time, not queue time:** days pass between queueing and sending. The worker
reads the booking and event again: refunded, cancelled or started → skip; moved later →
queue a new reminder instead. The idempotency key includes the start time, so a moved
event gets a new reminder but a retry never sends twice.

**A server that sleeps can't run a schedule.** Render's free plan sleeps after 15
minutes. A GitHub Actions workflow calls `/health` every 3 hours; the API wakes, pg-boss
starts and sends whatever is due. Minute 17, because GitHub says the top of the hour is
the busiest time and runs can be delayed.

**Budgets:** waking more often means reminders closer to 24 hours, but each wake keeps
Neon awake about 20 minutes. Every 3 hours is my estimate of a fair balance (about 20 of
100 CU-hours); I still need to measure it.

**Break tests, the safe way:** I copied each file before breaking it and restored from
the copy (my new rule after 6b), then checked the working tree was identical. Removing the
"moved later" check, the cancelled-event check, or the delay each failed tests.

**Interview lines:**
- "Delayed jobs are re-checked when they run, because the world changes between
  queueing and sending."
- "On a free plan that sleeps, I use an external scheduler to wake the server, and I
  sized the schedule against the database's compute budget."

## 2026-11-24 — Phase 6d: a circuit breaker

**Retries vs a breaker:** a retry helps one request. A breaker protects the whole app
when a provider is down: after 5 failures in a row it stops calling for 60 seconds, then
lets one trial request through. Closed → open → half-open → closed (or open again).

**Fail fast, but don't lose anything:** while the breaker is open, a send fails at once
with a retryable error, so the queue simply tries the job again later.

**What counts as "down":** only timeouts, network errors and 5xx/rate limits. A refused
address means Resend answered, so it doesn't count.

**Testing time without waiting:** the breaker takes a `now()` function, so the tests move
a fake clock 60 seconds forward instead of sleeping. One test holds a trial request open
to prove a second request in half-open fails fast.

**Breaking it on purpose** (each file copied first, then checked by checksum): never
opening, counting every error, letting everyone through in half-open, and making the
open-circuit error permanent each failed tests.

**Dead letter redrive:** a test dead-letters a job (permanent error), "fixes the cause",
calls `redrive()`, and the job runs again and completes.

**Interview line:** "Retries handle one failing request; a circuit breaker stops the
whole app from hammering a provider that's down, and gives it time to recover."
