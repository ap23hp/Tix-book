import {
  EmailSendError,
  type EmailMessage,
  type EmailSender,
} from "../lib/email.js";

// A stand-in for Resend in tests: records every message instead of sending.
// failNext() makes the next sends throw, to test retries (phase 6b).
export class FakeEmailSender implements EmailSender {
  sent: EmailMessage[] = [];
  private failures: EmailSendError[] = [];

  failNext(times = 1, retryable = true): void {
    for (let i = 0; i < times; i++) {
      this.failures.push(new EmailSendError("fake failure", retryable, 503));
    }
  }

  async send(message: EmailMessage): Promise<{ id: string }> {
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.sent.push(message);
    return { id: `fake-${this.sent.length}` };
  }
}
