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