import process from "node:process";

// Runs in every test file before its modules load (jest.config.js
// "setupFiles"). Supertest connects from 127.0.0.1, and many tests log in or
// hold seats far more often than the rate limits allow, so loopback is exempt
// in tests, the same as in local development. Set here, not in api/.env, so
// the tests don't depend on someone's local settings. The rate-limit tests
// turn the exemption off to test the limits (decision 067).
process.env.RATE_LIMIT_EXEMPT_LOOPBACK = "true";
