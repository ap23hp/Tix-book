import { writeFileSync } from "node:fs";
import QRCode from "qrcode";

// A fake camera that films a QR code, for the door scanner's e2e tests.
//
// Chromium can replace the camera with a video file
// (--use-file-for-fake-video-capture). Y4M is the simplest format it reads:
// a text header, then raw frames. Each frame is YUV 4:2:0: one brightness
// byte (Y) per pixel, then two colour planes (U, V) at quarter size. Grey
// colour planes (128) make it black and white. One frame is enough: Chromium
// plays it on a loop.

const WIDTH = 640;
const HEIGHT = 480;

export function writeQrVideo(text: string, file: string): void {
  // The same settings as the ticket page (error correction M)
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const modules = qr.modules.size;
  const quiet = 4;
  // As big as fits in the frame, in whole pixels per square
  const scale = Math.floor(HEIGHT / (modules + 2 * quiet));
  const size = (modules + 2 * quiet) * scale;
  const left = Math.floor((WIDTH - size) / 2);
  const top = Math.floor((HEIGHT - size) / 2);

  const y = Buffer.alloc(WIDTH * HEIGHT, 255); // white
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!qr.modules.get(row, col)) continue;
      for (let dy = 0; dy < scale; dy++) {
        const start =
          (top + (row + quiet) * scale + dy) * WIDTH +
          left +
          (col + quiet) * scale;
        y.fill(0, start, start + scale); // black
      }
    }
  }
  const colour = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2) * 2, 128);

  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F30:1 Ip A1:1 C420jpeg\n`),
      Buffer.from("FRAME\n"),
      y,
      colour,
    ]),
  );
}
