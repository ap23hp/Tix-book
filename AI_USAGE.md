# How I use AI on Tixbook

I build Tixbook with AI assistance, and I'm open about it.

- **Planning and learning (Claude chat):** I use Claude as a tutor. I study
  each part of the system until I can explain it without AI: the request path,
  sessions vs JWT, IDOR, cursor pagination, OAuth with PKCE. I run "explain
  tests" on myself and keep notes in LEARNING_LOG.md.
- **Writing code (Claude Code, Manual mode):** Claude Code proposes a plan for
  each step. I review and approve the plan, then every change before it's
  committed. Each feature goes through an Issue, a branch, tests and a PR.
- **Decisions are mine:** I choose the approach and log the trade-offs in
  DECISIONS.md. For example, sessions instead of JWT for login (023), and a
  404 instead of a 403 for other organisers' events (032).
- **Checks I do myself:** I review the tests, check features in the browser,
  and debug production issues using DevTools and logs.
- **What I don't do:** paste secrets into AI tools, or merge anything I can't
  explain.
