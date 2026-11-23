import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  createEvent,
  holdSeats,
  sendPaidWebhook,
  signUp,
  webhookSecret,
} from "./helpers";

// Automated accessibility checks with axe (the engine behind axe DevTools)
// against WCAG 2.2 A and AA. Automated tools find only part of the problems,
// so there is also a manual keyboard pass (see LEARNING_LOG).

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // The Next.js dev overlay only exists in development
    .exclude("nextjs-portal")
    .analyze();

  // A readable list on failure: rule, what it means, and where
  const problems = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n` +
      v.nodes.map((n) => `    ${n.target.join(" ")}`).join("\n"),
  );
  expect(problems, problems.join("\n\n")).toEqual([]);
}

// The value next to a term in a <dl> (<dt>term</dt><dd>value</dd>)
function stat(page: Page, term: string) {
  return page.locator("dt", { hasText: term }).locator("+ dd");
}

// Wait until the streamed part of the page has arrived
async function openAndWait(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: heading }),
  ).toBeVisible();
}

test.describe("logged out", () => {
  test("home page", async ({ page }) => {
    await openAndWait(page, "/", "Upcoming events");
    await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("event page", async ({ page }) => {
    await openAndWait(page, "/", "Upcoming events");
    const firstCard = page
      .getByRole("main")
      .getByRole("link")
      .filter({ has: page.getByRole("heading", { level: 3 }) })
      .first();
    await firstCard.click();
    await expect(
      page.getByRole("complementary", { name: "Tickets" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("event not found", async ({ page }) => {
    await openAndWait(page, "/events/not-a-real-id", "Event not found");
    await expectNoAxeViolations(page);
  });

  test("log in", async ({ page }) => {
    await openAndWait(page, "/login", "Log in");
    await expectNoAxeViolations(page);
  });

  test("sign up", async ({ page }) => {
    await openAndWait(page, "/signup", "Create an account");
    await expectNoAxeViolations(page);
  });
});

test.describe("logged in as an organiser", () => {
  let eventId = "";

  // A throwaway organiser and one event, created through the API.
  // The "events-test-" email prefix means the API tests' cleanup deletes them.
  test.beforeEach(async ({ page }) => {
    const email = `events-test-e2e-${Date.now()}@example.com`;
    const signup = await page.request.post("/api/v1/auth/signup", {
      data: {
        name: "E2E Organiser",
        email,
        password: `e2e-${Date.now()}-pw`,
        role: "ORGANISER",
      },
    });
    expect(signup.ok()).toBe(true); // the session cookie is now in this browser

    const created = await page.request.post("/api/v1/events", {
      data: {
        title: "E2E accessibility event",
        description: "Created by the accessibility test",
        category: "Music",
        format: "ONLINE",
        meetingLink: "https://example.com/meet",
        status: "PUBLISHED",
        startsAt: "2031-10-01T18:00:00.000Z",
        endsAt: "2031-10-01T20:00:00.000Z",
        timezone: "Europe/London",
        pricePence: 0,
        seatLimit: 20,
      },
    });
    expect(created.ok()).toBe(true);
    eventId = (await created.json()).id;
  });

  test("my events", async ({ page }) => {
    await openAndWait(page, "/my-events", "My events");
    await expect(page.getByRole("article").first()).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("create event", async ({ page }) => {
    await openAndWait(page, "/events/new", "Create an event");
    await expect(page.getByLabel("Title")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("edit event, and the discard dialog", async ({ page }) => {
    await openAndWait(page, `/events/${eventId}/edit`, "Edit event");
    await expect(page.getByLabel("Title")).toBeVisible();
    await expectNoAxeViolations(page);

    // Open the "Discard changes?" dialog and check it too
    await page.getByLabel("Title").fill("Changed");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("dialog", { name: "Discard changes?" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("event dashboard, empty and with a booking", async ({
    page,
    playwright,
    baseURL,
  }) => {
    await openAndWait(page, `/my-events/${eventId}`, "E2E accessibility event");
    await expect(page.getByText("No bookings yet.")).toBeVisible();
    await expectNoAxeViolations(page);

    // An attendee (another browser) books 2 seats of this free event
    const attendee = await playwright.request.newContext({ baseURL });
    await signUp(attendee, "ATTENDEE", "E2E Dashboard Attendee");
    await holdSeats(attendee, eventId, 2);
    await attendee.dispose();

    await openAndWait(page, `/my-events/${eventId}`, "E2E accessibility event");
    const row = page
      .getByRole("row")
      .filter({ hasText: "E2E Dashboard Attendee" });
    await expect(row).toContainText("Confirmed");
    await expect(stat(page, "Confirmed")).toHaveText("2 of 20");
    await expectNoAxeViolations(page);

    // At phone width only the table's own box scrolls, never the page
    await page.setViewportSize({ width: 375, height: 800 });
    const pageScrollsSideways = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(pageScrollsSideways).toBe(false);
    await expectNoAxeViolations(page);
  });

  test("account", async ({ page }) => {
    await openAndWait(page, "/account", "Your account");
    await expect(
      page.getByText("E2E Organiser", { exact: true }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("booking pages (logged in as an attendee)", () => {
  let eventId = "";

  // An organiser's paid event, and this browser logged in as an attendee
  test.beforeEach(async ({ page, request }) => {
    await signUp(request, "ORGANISER");
    eventId = await createEvent(request, {
      title: "E2E accessibility booking",
      seatLimit: 10,
      pricePence: 900,
    });
    await signUp(page.request, "ATTENDEE");
  });

  // Book 1 seat through the dialog and land on the booking page
  async function holdOneSeat(page: Page) {
    await page.goto(`/events/${eventId}`);
    await page.getByRole("button", { name: "Book tickets" }).click();
    await page.getByRole("button", { name: "Hold seats" }).click();
    await expect(page.getByRole("timer")).toBeVisible();
  }

  test("booking dialog", async ({ page }) => {
    await page.goto(`/events/${eventId}`);
    await page.getByRole("button", { name: "Book tickets" }).click();
    await expect(
      page.getByRole("dialog", { name: "Book tickets" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("held, payment cancelled, confirming, then confirmed", async ({
    page,
    request,
  }) => {
    await holdOneSeat(page);
    await expectNoAxeViolations(page);
    const bookingId = page.url().split("/").pop()!;

    // The pages Stripe sends people back to (opened directly: no need to
    // create a Stripe session to check how they read)
    await page.goto(`/bookings/${bookingId}?payment=cancelled`);
    await expect(page.getByText(/Payment cancelled/)).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto(`/bookings/${bookingId}?payment=success`);
    await expect(
      page.getByText("Payment received. Confirming your booking…"),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    const secret = webhookSecret();
    test.skip(!secret, "Stripe isn't set up (no STRIPE_WEBHOOK_SECRET)");
    await sendPaidWebhook(request, bookingId, secret!);
    await expect(page.getByText("You're going!")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("my tickets, empty and with a ticket", async ({ page }) => {
    await openAndWait(page, "/my-tickets", "My tickets");
    await expect(
      page.getByText("You haven't booked anything yet."),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await holdOneSeat(page);
    await openAndWait(page, "/my-tickets", "My tickets");
    await expect(page.getByRole("article").first()).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
