# Ticket Booking App — Plan

An event and ticket booking app. Organisers publish events, attendees hold a seat, pay, and get a ticket. The system never sells the same seat twice.

**The hard problem:** when 100 people try to book the last 5 seats at the same moment, exactly 5 get them, nobody is charged twice, and unpaid holds are released.

---

## 1. Why I'm building this

- "Design a ticket booking system" is a common system design interview question, so this doubles as interview prep.

---

## 2. Users and core flows

**Organisers** create events: title, date, venue or online link, ticket price, seat limit.
**Attendees** browse events, hold a seat, pay, get a confirmation email and ticket.

1. Browse and search upcoming events
2. Sign up / log in as organiser or attendee
3. Book: seat held for 5 minutes, confirmed on payment or released
4. Pay through Stripe (test mode)
5. Confirmation email, then a reminder before the event
6. "My tickets" (attendee) / "My events and bookings" (organiser)

---

## 3. Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript everywhere | |
| Frontend | Next.js + React | Main focus |
| Styling | Tailwind, CSS Modules, or a component library |
| Wireframes |
| API | Node.js + Express (separate service) |
| Database | PostgreSQL  |
| Cache / rate limiting | Redis | |
| Background jobs | pg-boss or a Redis queue |  |
| Payments | Stripe test mode | |
| Email | Transactional email service with free tier 
| Unit / component tests | Vitest or Jest + React Testing Library | 
| API tests | Supertest (or similar) | |
| End-to-end tests | Playwright | |
| Accessibility checks | Lighthouse, axe DevTools, eslint-plugin-jsx-a11y | |
| Load testing | k6 | |
| Fake data | @faker-js/faker | |
| Containers, CI/CD | Docker, GitHub Actions | |


### Tickets
- Tracked in **GitHub Issues** with a **GitHub Project board** (Backlog → In progress → Done).
- One branch per ticket, one pull request per ticket, ticket number in the PR title.
- Labels: `frontend`, `api`, `database`, `auth`, `a11y`, `test`, `infra`, `concept`.


### Definition of Done (every ticket)
- [ ] Works locally and on the deployed app
- [ ] At least one test (API, component, or both)
- [ ] Accessibility check: semantic HTML, labels, keyboard navigation, no Lighthouse a11y errors (UI tickets)
- [ ] Loading, empty and error states handled (UI tickets)
- [ ] Responsive: checked at mobile and desktop widths (UI tickets)
- [ ] Matches the wireframe, or the wireframe is updated (UI tickets)
- [ ] No TypeScript errors, ESLint passes
- [ ] Explain test done and noted in LEARNING_LOG.md
- [ ] DECISIONS.md updated if I made a choice



### Phase 1 — Foundations
**Goal:** a deployed app that lists events and lets someone create one.

Tasks
- [ ] One-page spec: users, pages, event and booking data
- [ ] Wireframes for every page (mobile and desktop), including the booking flow
- [ ] Database schema: users, events, bookings
- [ ] Choose styling approach (Tailwind, CSS Modules, or a component library), log why
- [ ] Basic design tokens: colours (checked for contrast), spacing, font sizes
- [ ] App layout: header, navigation, footer, main content area
- [ ] Mobile-first responsive base layout
- [ ] Repo setup: Next.js frontend, Express API, TypeScript, ESLint, Prettier
- [ ] Pick ORM (Prisma or Drizzle) and test runner (Vitest or Jest), log both in DECISIONS.md
- [ ] Neon database and first migration
- [ ] Seed script with faker
- [ ] API: list events, get one event, create event (no auth yet)
- [ ] Pages: event list, event detail, create-event form
- [ ] Decide which pages are Server Components and which are Client Components, log why
- [ ] Typed `fetchJson<T>()` helper (generics)
- [ ] First API test and first component test
- [ ] Add eslint-plugin-jsx-a11y; first Lighthouse run
- [ ] Deploy: frontend to Vercel, API to Render, settings in environment variables
- [ ] GitHub Project board set up with phase 1 tickets

Concepts: REST design, status codes, schema design, relationships, migrations, seeding, environment variables, Server vs Client Components, generics, async/await, wireframing, mobile-first responsive design
Accessibility: semantic HTML, form labels, heading order, landmarks (header, nav, main)
Explain test: REST, status codes, migrations, environment variables, Server Components

---

### Phase 2 — Auth and security (weeks 3–4)
**Goal:** organisers and attendees can sign up and log in; only organisers can create events.

Tasks
- [ ] Sign up and log in with email and password (hashed passwords)
- [ ] Choose sessions or JWT, log the trade-off
- [ ] Roles and permissions: organiser vs attendee
- [ ] Google login (OAuth)
- [ ] Protect API routes with middleware
- [ ] Login and sign-up pages (wireframe first)
- [ ] Header shows login state; menus change by role (organiser vs attendee)
- [ ] Protected pages redirect to login
- [ ] CORS set up correctly between Vercel and Render
- [ ] CSRF protection (if using cookies)
- [ ] Input validation on every endpoint
- [ ] Secrets in environment variables only, never in the repo
- [ ] Tests: login success/failure, protected route returns 401/403

Concepts: sessions vs JWT, password hashing, roles and permissions, OAuth, CORS, CSRF, XSS, SQL injection, secrets management, TLS/HTTPS, closures (middleware)
Accessibility: accessible form errors, focus moves to the first error
Explain test: sessions vs JWT, CORS, CSRF vs XSS, why hash passwords

---

### Phase 3 — Solid frontend and API (weeks 5–7)
**Goal:** a polished, reliable app good enough to show employers.

Tasks
- [ ] Search and filter events
- [ ] Pagination on the event list (API and UI)
- [ ] API versioning (`/api/v1/...`)
- [ ] Consistent error format and error handling in the API
- [ ] Loading, empty and error states on every page
- [ ] Forms with client and server validation
- [ ] Handle race conditions in data fetching (e.g. fast typing in search)
- [ ] Effect cleanup to avoid memory leaks
- [ ] Use a database transaction where two writes must succeed together
- [ ] State management decision (local state vs context vs a library), log why
- [ ] "My tickets" and "My events" pages
- [ ] Reusable components: Button, Input, Select, Card, Modal, Badge, Spinner
- [ ] Toast / notification messages for success and errors
- [ ] Event cards and event detail page polished (image, date, price, seats left)
- [ ] Responsive pass on every page (mobile, tablet, desktop)
- [ ] Full keyboard navigation pass and axe DevTools pass
- [ ] First Playwright end-to-end test: browse → open event
- [ ] README first version, live link

Concepts: rendering in React and Next.js, state management, hooks pitfalls (stale closures, dependency arrays), race conditions in fetching, memory leaks, pagination, API versioning, error handling, transactions, component design (props, composition, reuse)
Accessibility: keyboard navigation, visible focus, colour contrast, skip link, modal focus trap and Escape to close, toasts announced to screen readers
Explain test: how React re-renders, useEffect cleanup, pagination types, transactions

---

### Phase 4 — Booking and concurrency (weeks 8–9)
**Goal:** the hard problem. No double bookings, holds that expire.

Tasks
- [ ] Hold a seat for 5 minutes (booking status: held → confirmed / expired)
- [ ] Prevent double booking: try optimistic locking, then pessimistic locking (`SELECT ... FOR UPDATE`), log the trade-off
- [ ] Idempotency: the same booking request sent twice creates one booking
- [ ] Cron job to release expired holds
- [ ] Countdown timer on the frontend (watch for stale closures and cleanup)
- [ ] Booking flow UI: "Book" button → seat held screen → clear message when the hold expires
- [ ] Clear "sold out" and "someone else got the last seat" states
- [ ] Deliberately cause and observe a deadlock, then explain how to avoid it
- [ ] Test: many parallel booking requests for the last seats → exactly the right number succeed

Concepts: race conditions, optimistic vs pessimistic locking, idempotency, seat holds with expiry, cron jobs, deadlocks, event loop (timers)
Accessibility: countdown announced politely to screen readers (`aria-live`), not every second
Explain test: optimistic vs pessimistic locking, idempotency, deadlocks

---

### Phase 5 — Payments (weeks 10–11)
**Goal:** pay with Stripe test cards; a booking is confirmed only after payment.

Tasks
- [ ] Stripe Checkout in test mode
- [ ] Webhook endpoint that confirms the booking; verify the webhook signature
- [ ] Handle duplicate webhook deliveries (idempotency again)
- [ ] Handle payment failure and abandoned checkout (hold expires)
- [ ] Timeouts on calls to Stripe
- [ ] Payment success and payment failed pages
- [ ] Ticket page: event details, booking reference, optional QR code
- [ ] Organiser dashboard: bookings per event, seats left, held vs confirmed
- [ ] Tests: webhook confirms booking; duplicate webhook does nothing twice

Concepts: Stripe Checkout, webhooks, retries, payment failure handling, timeouts
Accessibility: clear payment status messages, not colour-only
Explain test: webhooks, why never trust the redirect page alone, idempotency keys

---

### Phase 6 — Background work and email (weeks 12–13)
**Goal:** confirmation and reminder emails sent reliably.

Tasks
- [ ] Choose queue: Postgres-based (pg-boss) or Redis, log why (watch Upstash command limits)
- [ ] Confirmation email via the queue
- [ ] Reminder email before the event (scheduled job)
- [ ] Retries with exponential backoff
- [ ] Dead letter queue for jobs that keep failing
- [ ] Timeouts and a simple circuit breaker around the email provider
- [ ] Tests: failed job is retried, then goes to the dead letter queue

Concepts: message queues, retries, exponential backoff, dead letter queues, timeouts, circuit breakers, cron jobs, event loop
Explain test: why use a queue, backoff, dead letter queue, circuit breaker

---

### Phase 7 — Performance (weeks 14–15)
**Goal:** fast pages and a fast API, with numbers to prove it.

Tasks
- [ ] Find and fix an N+1 query
- [ ] Add database indexes; compare query plans before and after (`EXPLAIN ANALYZE`)
- [ ] Connection pooling for Postgres
- [ ] Cache the event list in Redis; invalidate when an event changes
- [ ] Rate limiting on login and booking endpoints
- [ ] CDN and image optimisation for the frontend
- [ ] Measure Core Web Vitals (LCP, INP, CLS) before and after, record numbers
- [ ] Optional: live "seats left" counter with SSE or WebSockets

Concepts: indexing, N+1 queries, query optimisation, connection pooling, caching, cache invalidation, CDN, rate limiting, latency, Core Web Vitals
Accessibility: live seat counter announced sensibly
Explain test: indexes, N+1, cache invalidation, LCP/INP/CLS

---

### Phase 8 — Shipping and running (weeks 16–17)
**Goal:** run it like a production system.

Tasks
- [ ] Dockerfiles for frontend and API; docker compose for local dev
- [ ] GitHub Actions: lint, type-check, tests on every push
- [ ] Deploy only when tests pass
- [ ] Health check endpoint
- [ ] Structured logging
- [ ] Sentry for errors, UptimeRobot for uptime, alerts
- [ ] Feature flag for one feature
- [ ] Practise a rollback
- [ ] Semantic versioning and a CHANGELOG
- [ ] Playwright tests in CI: full booking flow

Concepts: Docker, CI/CD, automated tests, semantic versioning, feature flags, rollbacks, health checks, logging, monitoring, alerts
Explain test: CI vs CD, health checks, feature flags, how I'd roll back

---

### Phase 9 — Real users and the write-up (week 18)
**Goal:** real people use it; the README tells the story.

Tasks
- [ ] Run free online coding sessions and take bookings through the app
- [ ] Collect bugs and feedback; fix and log them
- [ ] k6 load test: e.g. 500 simulated users booking the last seats, record results
- [ ] "How I'd scale this" write-up
- [ ] 2–3 minute demo video and screenshots
- [ ] Architecture diagram
- [ ] Final README

---

## 7. "How I'd scale this" write-up (explain, don't build)

Load balancing, reverse proxies, API gateways, horizontal vs vertical scaling, autoscaling, read replicas, sharding, partitioning, replication, pub/sub and event-driven architecture, eventual consistency and the CAP theorem, distributed locks, the saga pattern, multi-region deployment, disaster recovery and backups, SLOs and SLIs.

**Skipped for now:** Kubernetes, Helm, Terraform, service discovery, leader election, chaos engineering, clock skew, and other senior infrastructure topics.

---
