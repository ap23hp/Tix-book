import { expect, test } from "@playwright/test";

// Read-only: uses the published events already in the dev database
// (from the seed). Nothing is created or changed.

test("browse the list, then open an event", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Upcoming events" }),
  ).toBeVisible();

  // Each event card is a link with the event's title as a level-3 heading
  const firstCard = page
    .getByRole("main")
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { level: 3 }) })
    .first();
  await expect(firstCard).toBeVisible();
  const title = (
    await firstCard.getByRole("heading", { level: 3 }).innerText()
  ).trim();

  await firstCard.click();

  // The event page for that same event: its title, the date and seats left
  await expect(page).toHaveURL(/\/events\/[\w-]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(page.getByText("Date", { exact: true })).toBeVisible();
  // Look inside the ticket box only. The home page we came from is still in
  // the DOM, hidden (<Activity>), and its cards can also say "Sold out".
  await expect(
    page
      .getByRole("complementary", { name: "Tickets" })
      .getByText(/\d+ of \d+ left|Sold out/),
  ).toBeVisible();
});

test("an unknown event shows 'Event not found'", async ({ page }) => {
  await page.goto("/events/not-a-real-id");
  await expect(
    page.getByRole("heading", { level: 1, name: "Event not found" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "All events" })).toHaveAttribute(
    "href",
    "/",
  );
});
