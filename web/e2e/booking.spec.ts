import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createEvent, holdSeats, signUp } from "./helpers";

// The whole booking flow in a real browser, against the real API and the
// dev database. Each test makes its own organiser, event and attendee.

test("book seats, confirm, and find the ticket on My tickets", async ({
  page,
  request,
}) => {
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

  // Confirm (the stand-in for payment)
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("You're going!")).toBeVisible();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Join the event online" }),
  ).toBeVisible();

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
