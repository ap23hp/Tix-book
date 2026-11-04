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