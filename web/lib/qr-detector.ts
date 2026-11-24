// Reads QR codes from the camera's video, for the door scanner.
//
// `barcode-detector` (decision 056) is the web's standard BarcodeDetector
// API, made with ZXing-C++ compiled to WebAssembly, so it works in every
// browser (only some have it built in). The ponyfill import doesn't touch
// the global object. It's imported only when the camera starts, so the
// code and its ~1 MB .wasm file never load for anyone who doesn't scan.

export type QrDetector = {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};

export async function createQrDetector(): Promise<QrDetector> {
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: ["qr_code"] });
}
