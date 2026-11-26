export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  testMatch: ["**/src/**/*.test.ts"],
  // Run every test in UTC, like Render (see the file for why)
  globalSetup: "./jest.global-setup.js",
  // Loopback exempt from rate limits in tests (see the file for why)
  setupFiles: ["./jest.setup-env.js"],
};
