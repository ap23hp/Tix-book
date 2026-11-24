// What the door scanner asks the camera for (decision 058).
//
// A ticket QR code is dense (version 13: 69 x 69 squares), and the scanner
// needs a few camera pixels per square to read it. Without a size, the
// browser picks its own default, which can be low.
//
// Every value here is "ideal": the browser gets as close as the camera
// allows. `min` or `exact` would be safer for quality but would make the
// camera fail to open (OverconstrainedError) on a phone that can't do it,
// and a scanner that won't open is worse than a softer picture.
export const IDEAL_RESOLUTION = { width: 1920, height: 1080 } as const;

export const SCANNER_VIDEO: MediaTrackConstraints = {
  // The back camera on phones; any camera elsewhere (a preference, so a
  // laptop with only a front camera still works)
  facingMode: "environment",
  width: { ideal: IDEAL_RESOLUTION.width },
  height: { ideal: IDEAL_RESOLUTION.height },
};

export type Resolution = { width: number; height: number };

// The size the browser really gave (it may differ from what we asked for).
// null if the browser doesn't say.
export function cameraResolution(stream: MediaStream): Resolution | null {
  const [track] = stream.getVideoTracks();
  const settings = track?.getSettings?.();
  if (!settings?.width || !settings.height) return null;
  return { width: settings.width, height: settings.height };
}

// In development only: print what we asked for and what we got, to compare
// cameras. Production builds stay quiet (nothing personal is in it, but
// the console is for debugging, not for organisers).
export function logCameraResolution(stream: MediaStream): void {
  if (process.env.NODE_ENV === "production") return;
  const got = cameraResolution(stream);
  console.info(
    `[scanner] camera asked for ${IDEAL_RESOLUTION.width} × ${IDEAL_RESOLUTION.height} (ideal), got ${
      got ? `${got.width} × ${got.height}` : "an unknown size"
    }`,
  );
}
