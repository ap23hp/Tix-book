import { defineConfig, devices } from "@playwright/test";

// End-to-end tests: a real browser against the real app (web + API + dev
// database). Jest covers components on their own; these check the pages
// work together, including the async Server Components Jest can't render
// (decision 021).
export default defineConfig({
  testDir: "./e2e",
  // Fail fast on a forgotten test.only
  forbidOnly: true,
  // The first page load in dev mode compiles the page, which can be slow
  timeout: 60_000,
  // Same reason: on a cold dev server, the first visit to a page can take
  // longer than the default 5 seconds while it compiles (seen with the
  // event page when tests ran in parallel)
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Start the API and the web app for the tests, or reuse ones that are
  // already running (e.g. your own `npm run dev`).
  webServer: [
    {
      command: "npm run dev",
      cwd: "../api",
      url: "http://localhost:4000/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
