import "server-only";
import QRCode from "qrcode";

// Turns the signed ticket into a QR code, on the server: the QR library
// never ships to the browser. Returned as an SVG data URL for an <img>.
// Error correction "M" still scans with ~15% of the code damaged (a
// cracked phone screen); a white margin helps scanners find the edges.
export async function ticketQrDataUrl(token: string): Promise<string> {
  const svg = await QRCode.toString(token, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
