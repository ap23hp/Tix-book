import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createEvent,
  holdSeats,
  sendPaidWebhook,
  signUp,
  webhookSecret,
} from "./helpers";

// The whole booking flow in a real browser, against the real API and the
// dev database. Each test makes its own organiser, event and attendee.

// The ticket QR code's drawn width in CSS pixels (in `within`, if given)
async function qrWidth(page: Page, within: Locator = page.locator("body")) {
  const box = await within
    .getByRole("img", { name: /^Ticket QR code for booking TIX-/ })
    .boundingBox();
  return Math.round(box?.width ?? 0);
}

test("book seats, pay, and find the ticket on My tickets", async ({
  page,
  request,
}) => {
  const secret = webhookSecret();
  test.skip(
    !secret,
    "Stripe isn't set up (no STRIPE_WEBHOOK_SECRET in api/.env)",
  );
  const title = `E2E booking ${randomUUID().slice(0, 8)}`;
  // The organiser works through `request`; the attendee is this browser page
  await signUp(request, "ORGANISER");
  const eventId = await createEvent(request, {
    title,
    seatLimit: 5,
    pricePence: 800,
  });
  await signUp(page.request, "ATTENDEE");

  // Event page → Book tickets → 2 seats
  await page.goto(`/events/${eventId}`);
  await page.getByRole("button", { name: "Book tickets" }).click();
  const dialog = page.getByRole("dialog", { name: "Book tickets" });
  await dialog.getByLabel("Seats").selectOption("2");
  await expect(dialog.getByText("£16")).toBeVisible();
  await dialog.getByRole("button", { name: "Hold seats" }).click();

  // The booking page: held, with the countdown running
  await expect(page).toHaveURL(/\/bookings\/[\w-]+$/);
  await expect(page.getByText("Held", { exact: true })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(/^[45]:\d\d$/);

  const bookingId = page.url().split("/").pop()!;

  // Pay → the API creates a real Stripe test-mode session → Stripe's page
  await page.getByRole("button", { name: "Pay £16 with Stripe" }).click();
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//);

  // Back on the success URL before the webhook arrives: the page must say
  // "confirming", not "confirmed" (the URL alone proves nothing)
  await page.goto(`/bookings/${bookingId}?payment=success`);
  await expect(
    page.getByText("Payment received. Confirming your booking…"),
  ).toBeVisible();
  await expect(page.getByText("You're going!")).toBeHidden();

  // Stripe's webhook arrives (signed) → the waiting page updates by itself
  await sendPaidWebhook(request, bookingId, secret!);
  await expect(page.getByText("You're going!")).toBeVisible();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Join the event online" }),
  ).toBeVisible();

  // The ticket: a QR code made from a signed token (decision 023)
  const qrName = /^Ticket QR code for booking TIX-/;
  await expect(page.getByRole("img", { name: qrName })).toBeVisible();

  // Big enough to scan from a phone at the door (#71, decision 057).
  // On a laptop: 384 px (max-w-sm). It was 192 px.
  expect(await qrWidth(page)).toBe(384);
  // On a phone (390 px wide): the full width of the ticket card
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await qrWidth(page)).toBeGreaterThanOrEqual(280);
  // Full screen: the width of the screen, minus a small margin
  await page.getByRole("button", { name: "Show full screen" }).click();
  const fullScreen = page.getByRole("dialog", { name: "Your ticket" });
  await expect(fullScreen.getByRole("img", { name: qrName })).toBeVisible();
  expect(await qrWidth(page, fullScreen)).toBeGreaterThanOrEqual(350);
  await fullScreen.getByRole("button", { name: "Close" }).click();
  await expect(fullScreen).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 720 });

  // At the door: the organiser checks the attendee's ticket
  const ticketResponse = await page.request.get(
    `/api/v1/bookings/${bookingId}/ticket`,
  );
  const { token } = await ticketResponse.json();
  const atTheDoor = await request.post("/api/v1/tickets/verify", {
    data: { eventId, code: token },
  });
  expect(atTheDoor.status()).toBe(200);
  expect(await atTheDoor.json()).toMatchObject({ result: "valid", seats: 2 });
  // The attendee can't check tickets (only organisers can)
  const notAllowed = await page.request.post("/api/v1/tickets/verify", {
    data: { eventId, code: token },
  });
  expect(notAllowed.status()).toBe(403);

  // My tickets shows it, confirmed
  await page.getByRole("link", { name: "My tickets" }).click();
  const ticket = page.getByRole("article").filter({ hasText: title });
  await expect(ticket).toContainText("Confirmed");
  await expect(ticket).toContainText("2 seats");
});

test("someone else gets the last seat first", async ({
  page,
  request,
  playwright,
  baseURL,
}) => {
  const title = `E2E last seat ${randomUUID().slice(0, 8)}`;
  await signUp(request, "ORGANISER");
  const eventId = await createEvent(request, {
    title,
    seatLimit: 1,
    pricePence: 500,
  });
  await signUp(page.request, "ATTENDEE");

  // Attendee A opens the dialog for the only seat...
  await page.goto(`/events/${eventId}`);
  await expect(page.getByText("1 of 1 left")).toBeVisible();
  await page.getByRole("button", { name: "Book tickets" }).click();

  // ...but attendee B (another browser) holds it first
  const someoneElse = await playwright.request.newContext({ baseURL });
  await signUp(someoneElse, "ATTENDEE", "E2E Someone Else");
  await holdSeats(someoneElse, eventId, 1);
  await someoneElse.dispose();

  // A tries: refused, with a clear message, and the page now says Sold out
  await page.getByRole("button", { name: "Hold seats" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "someone else" }),
  ).toHaveText("Sorry, someone else just got the last seats.");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Sold out" })).toBeDisabled();
});
