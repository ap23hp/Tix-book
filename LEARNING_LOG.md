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

 