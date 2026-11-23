// Sending email (phase 6, decision 049).
// The rest of the app only knows the EmailSender interface. The real sender
// calls Resend's HTTP API; tests swap in a fake that records messages, so the
// test suite never sends email and needs no API key.
// HTTP, not SMTP: Render's free plan blocks outgoing SMTP ports.

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  // Resend remembers this key for 24 hours: sending again with the same key
  // doesn't send a second email. One key per email we mean to send, e.g.
  // "booking-confirmed/<bookingId>", so a retry after a timeout is safe.
  idempotencyKey: string;
};

export interface EmailSender {
  send(message: EmailMessage): Promise<{ id: string }>;
}

// Why a send failed, and whether trying again later could work.
// retryable: a timeout, a network error, "too many requests", or Resend's
// own 5xx. Not retryable: a request Resend says is wrong (bad key, bad
// address, quota used up); repeating the same request gets the same answer.
// The message holds only the status and Resend's error name: Resend's text
// can include an email address, and logs shouldn't.
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

const RESEND_URL = "https://api.resend.com/emails";
// Resend usually answers in well under a second. A send runs in a background
// job (phase 6b), so nobody is waiting on it, but a stuck request must not
// hold the worker forever.
const TIMEOUT_MS = 10_000;

// 409s that mean "the same request is still running": try again shortly.
const RETRYABLE_409 = new Set([
  "concurrent_idempotent_requests",
  "resource_locked",
]);

export function isRetryable(status: number, name: string | undefined): boolean {
  if (status >= 500) return true;
  // 429 is either "slow down" (retry) or a daily/monthly quota used up.
  // A quota only resets at midnight UTC, so quick retries can't help.
  if (status === 429) return name === "rate_limit_exceeded";
  if (status === 409) return name !== undefined && RETRYABLE_409.has(name);
  return false;
}

export function createResendSender(
  apiKey: string,
  from: string,
  // Passed in so tests can check the request without the network
  fetchFn: typeof fetch = fetch,
): EmailSender {
  return {
    async send(message) {
      let res: Response;
      try {
        res = await fetchFn(RESEND_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            // Resend refuses requests without a User-Agent (403)
            "User-Agent": "tixbook-api/1.0",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        // Timeout, DNS failure, connection reset... we don't know whether
        // Resend got it. The idempotency key makes a retry safe either way.
        const reason =
          err instanceof Error && err.name === "TimeoutError"
            ? "timed out"
            : "network error";
        throw new EmailSendError(`Resend request ${reason}`, true);
      }

      const body: unknown = await res.json().catch(() => undefined);
      if (!res.ok) {
        const name =
          typeof body === "object" &&
          body !== null &&
          "name" in body &&
          typeof body.name === "string"
            ? body.name
            : undefined;
        throw new EmailSendError(
          `Resend answered ${res.status}${name ? ` ${name}` : ""}`,
          isRetryable(res.status, name),
          res.status,
        );
      }
      const id =
        typeof body === "object" &&
        body !== null &&
        "id" in body &&
        typeof body.id === "string"
          ? body.id
          : "";
      return { id };
    },
  };
}

// ---- Sandbox mode ----
// Without a domain of our own, Resend only delivers to the address of the
// Resend account (decision 049). EMAIL_SANDBOX_ALLOWLIST lists who may get
// email: comma-separated addresses, or "*" for everyone (once a domain is
// verified). Unset or empty means nobody: forgetting the setting can't
// start emailing real attendees.
export function parseAllowlist(value: string | undefined): Set<string> | "all" {
  if (value?.trim() === "*") return "all";
  return new Set(
    (value ?? "")
      .split(",")
      .map((address) => address.trim().toLowerCase())
      .filter((address) => address.length > 0),
  );
}

export type SendOutcome =
  | { status: "sent"; id: string }
  | { status: "skipped"; reason: "sandbox" | "disabled" };

export type EmailSettings = {
  // null when RESEND_API_KEY isn't set: email is switched off
  sender: EmailSender | null;
  allowlist: Set<string> | "all";
  log: (line: string) => void;
};

// The one function the rest of the app calls.
// A skipped email is a normal outcome, not an error: a booking must never
// fail because of email. A real failure throws EmailSendError, which the
// queue (phase 6b) retries or gives up on; it never reaches a booking.
// Logs name the email by its idempotency key, never by address.
export async function sendEmail(
  message: EmailMessage,
  settings: EmailSettings = emailSettings(),
): Promise<SendOutcome> {
  if (!settings.sender) {
    settings.log(`[email] skipped: disabled (${message.idempotencyKey})`);
    return { status: "skipped", reason: "disabled" };
  }
  const allowed =
    settings.allowlist === "all" ||
    settings.allowlist.has(message.to.trim().toLowerCase());
  if (!allowed) {
    settings.log(`[email] skipped: sandbox (${message.idempotencyKey})`);
    return { status: "skipped", reason: "sandbox" };
  }
  const { id } = await settings.sender.send(message);
  settings.log(`[email] sent (${message.idempotencyKey})`);
  return { status: "sent", id };
}

// ---- Settings from the environment ----
// Tests set emailGateway.sender to a fake (like stripeGateway, decision 043).
export const emailGateway: { sender: EmailSender | null | undefined } = {
  sender: undefined,
};

let resendSender: EmailSender | undefined;

function emailSettings(): EmailSettings {
  return {
    sender:
      emailGateway.sender !== undefined ? emailGateway.sender : realSender(),
    allowlist: parseAllowlist(process.env.EMAIL_SANDBOX_ALLOWLIST),
    log: (line) => console.log(line),
  };
}

// Created on first use (like getStripe), so the API runs without email set up
function realSender(): EmailSender | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  resendSender ??= createResendSender(
    apiKey,
    process.env.EMAIL_FROM ?? "Tixbook <onboarding@resend.dev>",
  );
  return resendSender;
}
