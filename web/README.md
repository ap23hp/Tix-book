# Tixbook web

The Next.js 16 frontend of Tixbook. The project overview, how to run everything
locally, and the docs are in the [main README](../README.md).

Commands (in this folder):

- `npm run dev`: the app on http://localhost:3000 (needs the API on port 4000 and
  `API_URL` in `.env.local`)
- `npm test`: unit and component tests (Jest + React Testing Library)
- `npm run test:e2e`: end-to-end and accessibility tests (Playwright + axe)
- `npm run lint`: ESLint, including the jsx-a11y accessibility rules
- `npm run build`: production build
