// Manual check: sends ONE sample "booking confirmed" email through Resend to
// the first address in EMAIL_SANDBOX_ALLOWLIST. Run: npm run email:test
// Needs RESEND_API_KEY in api/.env. Never prints the key or the address.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { EmailSendError, parseAllowlist, sendEmail } from "../lib/email.js";
import { bookingConfirmedEmail } from "../lib/email-templates.js";
import { webUrl } from "../lib/web-url.js";

const allowlist = parseAllowlist(process.env.EMAIL_SANDBOX_ALLOWLIST);
const to = allowlist === "all" ? undefined : [...allowlist][0];
if (!to) {
  console.error(
    "Set EMAIL_SANDBOX_ALLOWLIST in api/.env to your own address (the one your Resend account uses).",
  );
  process.exit(1);
}

const content = bookingConfirmedEmail(
  {
    attendeeName: "Test attendee",
    reference: "TB-TEST01",
    seats: 2,
    eventTitle: "Sample event <check escaping>",
    startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    timezone: "Europe/London",
    format: "IN_PERSON",
    venueName: "Sample venue",
    venueAddress: "1 Example Street, London",
  },
  webUrl(),
);

try {
  // A new key each run, so running it twice sends twice
  const outcome = await sendEmail({
    to,
    ...content,
    idempotencyKey: `manual-test/${randomUUID()}`,
  });
  console.log(
    "Outcome:",
    outcome.status,
    "reason" in outcome ? outcome.reason : "",
  );
} catch (err) {
  if (err instanceof EmailSendError) {
    console.error(`Failed: ${err.message} (retryable: ${err.retryable})`);
    process.exit(1);
  }
  throw err;
}
