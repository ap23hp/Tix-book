import process from "node:process";

// Runs once, in the main Jest process, before any test file. Test files run
// in a sandbox where changing process.env.TZ doesn't reach the real process,
// so the time zone has to be set here.
// Render runs in UTC; my laptop is in Europe/London. Running the tests in
// UTC means a date that's only right "by luck" on a London machine fails.
export default function globalSetup() {
  process.env.TZ = "UTC";
}
