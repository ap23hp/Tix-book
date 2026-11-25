import {
  cameraResolution,
  logCameraResolution,
  SCANNER_VIDEO,
} from "@/lib/camera";

// A stream whose video track reports these settings
function streamWith(settings: Partial<MediaTrackSettings>) {
  const track = { getSettings: () => settings };
  return { getVideoTracks: () => [track] } as unknown as MediaStream;
}

// Every key in the constraints, at any depth
function keysOf(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) => [
    key,
    ...keysOf(inner),
  ]);
}

describe("SCANNER_VIDEO (what the scanner asks the camera for)", () => {
  it("asks for the back camera and 1920 x 1080", () => {
    expect(SCANNER_VIDEO).toEqual({
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    });
  });

  // min, max and exact are required: a camera that can't meet them fails
  // to open (OverconstrainedError). Preferences only, so it always opens.
  it("only uses preferences, never min, max or exact", () => {
    expect(keysOf(SCANNER_VIDEO)).not.toEqual(expect.arrayContaining(["min"]));
    expect(keysOf(SCANNER_VIDEO)).not.toEqual(expect.arrayContaining(["max"]));
    expect(keysOf(SCANNER_VIDEO)).not.toEqual(
      expect.arrayContaining(["exact"]),
    );
  });
});

describe("cameraResolution", () => {
  it("reads the size the browser really gave", () => {
    expect(cameraResolution(streamWith({ width: 1280, height: 720 }))).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it("is null when the browser doesn't say", () => {
    expect(cameraResolution(streamWith({}))).toBeNull();
  });
});

describe("logCameraResolution", () => {
  const env = process.env as Record<string, string | undefined>;
  const before = env.NODE_ENV;
  afterEach(() => {
    env.NODE_ENV = before;
    jest.restoreAllMocks();
  });

  it("logs what was asked for and what was given, in development", () => {
    env.NODE_ENV = "development";
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    logCameraResolution(streamWith({ width: 1920, height: 1080 }));
    expect(info).toHaveBeenCalledWith(
      "[scanner] camera asked for 1920 × 1080 (ideal), got 1920 × 1080",
    );
  });

  it("says nothing in production", () => {
    env.NODE_ENV = "production";
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    logCameraResolution(streamWith({ width: 1920, height: 1080 }));
    expect(info).not.toHaveBeenCalled();
  });
});
