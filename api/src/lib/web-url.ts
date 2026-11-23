// The web app's address, without a trailing slash. Used for links that leave
// the API: Stripe's "back to the booking" page and links in emails.
// Locally the web app runs on port 3000.
export function webUrl(): string {
  return (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
