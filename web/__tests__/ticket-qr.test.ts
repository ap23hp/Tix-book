/**
 * @jest-environment node
 */
// ticketQrDataUrl only runs on the server (Node), not in the browser
import { ticketQrDataUrl } from "@/lib/ticket-qr";

describe("ticketQrDataUrl", () => {
  it("turns a ticket token into an SVG data URL", async () => {
    const url = await ticketQrDataUrl("header.payload.signature");
    expect(url.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    const svg = decodeURIComponent(
      url.slice("data:image/svg+xml;utf8,".length),
    );
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });

  it("gives different codes for different tickets", async () => {
    expect(await ticketQrDataUrl("ticket-a")).not.toBe(
      await ticketQrDataUrl("ticket-b"),
    );
  });
});
