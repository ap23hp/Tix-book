import type { Config } from "jest";
import nextJest from "next/jest.js";

// Every test run uses London time, whatever the computer is set to, so tests
// about local times (datetime-local inputs) give the same result everywhere.
// Set here, before Jest starts its workers: changing process.env.TZ inside a
// test file does nothing (each file gets its own copy of process.env).
process.env.TZ = "Europe/London";

const createJestConfig = nextJest({
  // Path to the Next.js app, so next.config.ts and .env files load in tests
  dir: "./",
});

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // e2e/ holds Playwright tests; they run with `npm run test:e2e`, not Jest
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/e2e/"],
  // Same "@/..." shortcut as tsconfig.json
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default createJestConfig(config);
