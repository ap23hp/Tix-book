/**
 * @jest-environment node
 */
// ticketQrDataUrl only runs on the server (Node), not in the browser
import { ticketQrDataUrl } from "@/lib/ticket-qr";

function svgOf(url: string) {
  return decodeURIComponent(url.slice("data:image/svg+xml;utf8,".length));
}

// As long as a real ticket token today (decision 057: 315 characters)
const TICKET_SIZED = "x".repeat(315);

describe("ticketQrDataUrl", () => {
  it("turns a ticket token into an SVG data URL", async () => {
    const url = await ticketQrDataUrl("header.payload.signature");
    expect(url.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    const svg = svgOf(url);
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });

  it("gives different codes for different tickets", async () => {
    expect(await ticketQrDataUrl("ticket-a")).not.toBe(
      await ticketQrDataUrl("ticket-b"),
    );
  });

  // A QR code is a grid of squares (modules). The SVG's viewBox is that
  // grid plus the quiet zone on both sides, in modules.
  it("has a 4-module white quiet zone around the code", async () => {
    const svg = svgOf(await ticketQrDataUrl(TICKET_SIZED));
    const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
    // The whole square is white first...
    expect(svg).toContain(`<path fill="#ffffff" d="M0 0h${size}v${size}H0z"/>`);
    // ...and the first black square (a finder pattern corner) is 4 in
    expect(svg).toMatch(/<path stroke="#000000" d="M4 4\.5h7/);
  });

  it("keeps a ticket-sized token at QR version 13 (error correction M)", async () => {
    const svg = svgOf(await ticketQrDataUrl(TICKET_SIZED));
    // Version 13 is 69 x 69 modules, + 4 + 4 quiet zone = 77.
    // Error correction L would give 61 + 8, Q 81 + 8, H 93 + 8.
    expect(svg).toContain('viewBox="0 0 77 77"');
  });
});
