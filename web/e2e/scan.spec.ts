import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createEvent, signUp } from "./helpers";

// The door scanner (issue #67) in a real browser, against the real API and
// the dev database. This pastes what the QR code contains; scan-phone.spec.ts
// scans it with a fake camera that films the QR code.

test("an organiser checks a ticket in at the door, and only once", async ({
  page,
  playwright,
  baseURL,
}) => {
  const title = `E2E door ${randomUUID().slice(0, 8)}`;
  // The organiser is this browser page
  await signUp(page.request, "ORGANISER");
  const eventId = await createEvent(page.request, {
    title,
    seatLimit: 5,
    pricePence: 0,
  });

  // An attendee (another browser) books 2 seats of this free event, which
  // confirms straight away, and gets the signed ticket the QR code shows
  const attendee = await playwright.request.newContext({ baseURL });
  await signUp(attendee, "ATTENDEE");
  const booked = await attendee.post(`/api/v1/events/${eventId}/bookings`, {
    data: { seats: 2, idempotencyKey: randomUUID() },
  });
  expect(booked.status()).toBe(201);
  const booking: { id: string; reference: string } = await booked.json();
  const ticket = await attendee.get(`/api/v1/bookings/${booking.id}/ticket`);
  expect(ticket.status(), "needs TICKET_JWT_SECRET in api/.env").toBe(200);
  const { token } = await ticket.json();

  // Dashboard → the scanner
  await page.goto(`/my-events/${eventId}`);
  await page.getByRole("link", { name: "Check tickets at the door" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Check tickets" }),
  ).toBeVisible();
  // The dashboard stays in the DOM, hidden (<Activity>), and Next.js
  // announces the title too: look for the visible paragraph only
  await expect(
    page.getByRole("paragraph").filter({ hasText: title, visible: true }),
  ).toBeVisible();

  // Paste the QR code's content → valid, checked in now
  const field = page.getByLabel("Ticket code or booking reference");
  const status = page.getByRole("status", { name: "Ticket check result" });
  await field.fill(token);
  await page.getByRole("button", { name: "Check ticket" }).click();
  await expect(status).toContainText("Valid: let them in");
  await expect(status).toContainText(`${booking.reference} · 2 seats`);
  // The field is empty and focused, ready for the next ticket
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();

  // The same booking again, typed as its reference this time → refused
  await field.fill(booking.reference.toLowerCase());
  await field.press("Enter");
  await expect(status).toContainText(/Already used at \d\d:\d\d/);
  await expect(status).toContainText("Don't let them in again.");

  // Not someone else's door: another organiser gets a 404 page, and an
  // attendee is told the page is for organisers
  const other = await playwright.request.newContext({ baseURL });
  await signUp(other, "ORGANISER");
  const otherPage = await page
    .context()
    .browser()!
    .newPage({
      baseURL,
      storageState: await other.storageState(),
    });
  await otherPage.goto(`/my-events/${eventId}/scan`);
  await expect(
    otherPage.getByText("This page could not be found."),
  ).toBeVisible();
  const attendeePage = await page
    .context()
    .browser()!
    .newPage({
      baseURL,
      storageState: await attendee.storageState(),
    });
  await attendeePage.goto(`/my-events/${eventId}/scan`);
  await expect(
    attendeePage.getByText("Only organisers can check tickets."),
  ).toBeVisible();

  await Promise.all([
    otherPage.close(),
    attendeePage.close(),
    other.dispose(),
    attendee.dispose(),
  ]);
});
