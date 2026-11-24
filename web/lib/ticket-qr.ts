import "server-only";
import QRCode from "qrcode";

// Turns the signed ticket into a QR code, on the server: the QR library
// never ships to the browser. Returned as an SVG data URL for an <img>, so
// it stays sharp at any size (the page draws it as big as the screen allows).
//
// Error correction "M" still scans with ~15% of the code damaged (a cracked
// phone screen, a glare spot). "L" would make each square only ~12% bigger
// (QR version 11 instead of 13 for today's ticket), much less than drawing
// it larger gains, so we keep the safety margin (decision 057).
//
// The quiet zone (the white border) is 4 squares wide, the size the QR
// standard asks for: scanners use it to find where the code starts. It's
// part of the image, so it scales with the code and needs no CSS padding.
export const TICKET_QR_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 4,
  // Pure black on pure white: the highest contrast a scanner can get
  color: { dark: "#000000", light: "#ffffff" },
} as const;

export async function ticketQrDataUrl(token: string): Promise<string> {
  const svg = await QRCode.toString(token, {
    type: "svg",
    ...TICKET_QR_OPTIONS,
  });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
