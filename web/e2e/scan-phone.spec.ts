import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { writeQrVideo } from "./fake-camera";
import { createEvent, signUp } from "./helpers";

// The door scanner on a phone (#75): after "Scan with camera", the camera
// view and the result must be on screen, with no scrolling. Chromium's
// camera is replaced by a video of a real ticket QR code, so this is a
// real scan: getUserMedia → the video → the QR detector → the API.

const PHONE = { width: 390, height: 844 };

// Where an element is, for the report when a check fails
async function where(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const box = el.getBoundingClientRect();
    return `top ${Math.round(box.top)}, bottom ${Math.round(box.bottom)} (screen is ${innerHeight} high, scrolled ${Math.round(scrollY)})`;
  });
}

test("on a phone, the camera view and the scan result are on screen", async ({
  playwright,
  baseURL,
}, testInfo) => {
  // A free event, booked by an attendee, and their signed ticket
  const organiser = await playwright.request.newContext({ baseURL });
  await signUp(organiser, "ORGANISER");
  const eventId = await createEvent(organiser, {
    title: `E2E phone door ${randomUUID().slice(0, 8)}`,
    seatLimit: 5,
    pricePence: 0,
  });
  const attendee = await playwright.request.newContext({ baseURL });
  await signUp(attendee, "ATTENDEE");
  const booked = await attendee.post(`/api/v1/events/${eventId}/bookings`, {
    data: { seats: 1, idempotencyKey: randomUUID() },
  });
  expect(booked.status()).toBe(201);
  const { id: bookingId } = await booked.json();
  const ticket = await attendee.get(`/api/v1/bookings/${bookingId}/ticket`);
  expect(ticket.status(), "needs TICKET_JWT_SECRET in api/.env").toBe(200);
  const { token } = await ticket.json();

  // The "camera" films that ticket's QR code
  const video = testInfo.outputPath("ticket-qr.y4m");
  writeQrVideo(token, video);
  const browser = await playwright.chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream", // allow the camera, no prompt
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${video}`,
    ],
  });
  const context = await browser.newContext({
    baseURL,
    viewport: PHONE,
    hasTouch: true,
    storageState: await organiser.storageState(),
  });
  const page = await context.newPage();

  try {
    await page.goto(`/my-events/${eventId}/scan`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Check tickets" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Scan with camera" }).click();
    const camera = page.getByLabel(/^Camera view/);
    const stop = page.getByRole("button", { name: "Stop camera" });
    await expect(camera).toBeVisible();
    // Keyboard and screen-reader users stay on the camera button
    await expect(stop).toBeFocused();
    await expect(
      camera,
      `camera view: ${await where(page, "video")}`,
    ).toBeInViewport({ ratio: 1 });
    await expect(stop).toBeInViewport({ ratio: 1 });

    // The camera reads the QR code by itself
    const status = page.getByRole("status", { name: "Ticket check result" });
    await expect(status).toContainText("Valid: let them in");
    await expect(
      status,
      `result: ${await where(page, '[aria-label="Ticket check result"]')}`,
    ).toBeInViewport({ ratio: 1 });
    // The camera is still on screen too, ready for the next ticket
    await expect(camera).toBeInViewport({ ratio: 1 });

    // Accessibility (WCAG 2.2 A + AA, as in a11y.spec.ts) with the camera
    // on and a result showing, at phone width
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .exclude("nextjs-portal")
      .analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // The paste-in box is still reachable
    const field = page.getByLabel("Ticket code or booking reference");
    await field.scrollIntoViewIfNeeded();
    await expect(field).toBeInViewport();
  } finally {
    await browser.close();
    await Promise.all([organiser.dispose(), attendee.dispose()]);
  }
});
