"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { logCameraResolution, SCANNER_VIDEO } from "@/lib/camera";
import { postJson } from "@/lib/client-api";
import { formatInZone } from "@/lib/format";
import { createQrDetector, type QrDetector } from "@/lib/qr-detector";
import type { CheckInResult } from "@/lib/types";
import { display } from "@/lib/ui";

type Props = { eventId: string; timezone: string };

type Camera = "off" | "starting" | "on";

// How often to look for a QR code in the camera picture
const SCAN_EVERY_MS = 300;
// The same QR code is still in front of the camera after it's been checked:
// don't send it again straight away (the API would say "already used")
const SAME_CODE_PAUSE_MS = 4000;

// The door scanner for one event: the camera where the browser allows it,
// and always a box to type or paste the code (works on any device, with a
// keyboard, and with USB scanners, which type the code and press Enter).
export function TicketScanner({ eventId, timezone }: Props) {
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>("off");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<QrDetector | null>(null);
  // A ref, not state: the camera loop reads it between renders
  const busyRef = useRef(false);
  const lastScanRef = useRef({ code: "", at: 0 });

  const check = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setFieldError("Enter a ticket code or booking reference");
        return;
      }
      if (busyRef.current) return;
      busyRef.current = true;
      setChecking(true);
      setFieldError(undefined);
      setRequestError(null);

      const response = await postJson<CheckInResult>("/api/v1/tickets/verify", {
        eventId,
        code: trimmed,
      });

      busyRef.current = false;
      setChecking(false);
      if (response.ok) {
        setResult(response.data);
        setCode("");
      } else {
        setResult(null);
        setRequestError(
          response.status === 401
            ? "You've been logged out. Log in again to check tickets."
            : response.status === 404
              ? "This event wasn't found, or it isn't yours."
              : response.message,
        );
      }
    },
    [eventId],
  );

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function stopCamera() {
    stopTracks();
    setCamera("off");
  }

  async function startCamera() {
    setCameraError(null);
    // Missing on plain http:// pages and in some in-app browsers
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "This browser can't use the camera here. Type or paste the code instead.",
      );
      return;
    }
    setCamera("starting");
    try {
      const [stream, detector] = await Promise.all([
        // The back camera, as sharp as it allows (lib/camera.ts)
        navigator.mediaDevices.getUserMedia({
          video: SCANNER_VIDEO,
          audio: false,
        }),
        createQrDetector(),
      ]);
      streamRef.current = stream;
      detectorRef.current = detector;
      logCameraResolution(stream);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setCamera("on");
    } catch (error) {
      stopCamera();
      setCameraError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera access was refused. Allow it in the browser's site settings, or type or paste the code instead."
          : "Couldn't start the camera. Type or paste the code instead.",
      );
    }
  }

  // When the camera starts, scroll so the camera button, the picture and
  // the result space are on screen: on a phone they start below the form
  // (#75). Focus isn't moved: it stays on the same button, now "Stop
  // camera", so keyboard and screen-reader users aren't sent anywhere.
  useEffect(() => {
    if (camera !== "starting") return;
    panelRef.current?.scrollIntoView?.({
      block: "start",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [camera]);

  // While the camera is on, look for a QR code a few times a second
  useEffect(() => {
    if (camera !== "on") return;
    const timer = setInterval(async () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || busyRef.current) return;
      try {
        const [found] = await detector.detect(video);
        if (!found) return;
        const last = lastScanRef.current;
        const now = Date.now();
        if (found.rawValue === last.code && now - last.at < SAME_CODE_PAUSE_MS)
          return;
        lastScanRef.current = { code: found.rawValue, at: now };
        await check(found.rawValue);
      } catch {
        // A frame that couldn't be read (e.g. the video is still starting):
        // just try the next one
      }
    }, SCAN_EVERY_MS);
    return () => clearInterval(timer);
  }, [camera, check]);

  // Leaving the page (or Next.js hiding it with <Activity>) turns
  // the camera off: a hidden page must not keep filming. The last result is
  // cleared too, so an old "Valid" isn't shown when coming back.
  useEffect(() => {
    return () => {
      stopTracks();
      setCamera("off");
      setResult(null);
      setRequestError(null);
    };
  }, []);

  return (
    <div className="mt-8 grid gap-8 md:grid-cols-2">
      <div>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            // Ready for the next ticket straight away
            const field = e.currentTarget.elements.namedItem("code");
            void check(code).then(() => {
              if (field instanceof HTMLInputElement) field.focus();
            });
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label="Ticket code or booking reference"
            hint="Paste the code from the ticket's QR code, or type the reference (TIX-…)."
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={fieldError}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <Button type="submit" disabled={checking}>
            {checking ? "Checking…" : "Check ticket"}
          </Button>
        </form>
      </div>

      {/* The camera and the result together: on a phone they're on screen
          at the same time when the camera starts (#75) */}
      <section
        ref={panelRef}
        aria-label="Camera scanner"
        className="scroll-mt-4"
      >
        {camera === "off" ? (
          <Button variant="secondary" onClick={() => void startCamera()}>
            Scan with camera
          </Button>
        ) : (
          <Button variant="secondary" onClick={stopCamera}>
            Stop camera
          </Button>
        )}
        {cameraError && (
          <p role="alert" className="mt-3 text-sm text-ink-soft">
            {cameraError}
          </p>
        )}
        {camera !== "off" && (
          // The viewfinder: muted, no sound track, so no captions needed
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Camera view: hold the ticket's QR code up to it"
            className="mt-4 aspect-square w-full max-w-sm rounded-lg bg-ink object-cover"
          />
        )}
        {camera === "starting" && (
          <p className="mt-2 text-sm text-ink-muted">Starting the camera…</p>
        )}

        {/* Always in the page, so screen readers announce each new result */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label="Ticket check result"
          className="mt-4"
        >
          {requestError && (
            <p className="rounded-lg border border-line bg-surface p-5 text-ink">
              {requestError}
            </p>
          )}
          {result && <ResultCard result={result} timezone={timezone} />}
        </div>
      </section>
    </div>
  );
}

// People who turned on "reduce motion" get an instant jump, not an animation
function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

type View = { ok: boolean; title: string; detail: string };

function describe(result: CheckInResult, timezone: string): View {
  const time = (iso: string) =>
    formatInZone(iso, timezone, { hour: "2-digit", minute: "2-digit" });
  const seats = (n: number) => (n === 1 ? "1 seat" : `${n} seats`);

  switch (result.result) {
    case "valid":
      return {
        ok: true,
        title: "Valid: let them in",
        detail: `${result.reference} · ${seats(result.seats)}. Checked in at ${time(result.checkedInAt)}.`,
      };
    case "already_used":
      return {
        ok: false,
        title: `Already used at ${time(result.checkedInAt)}`,
        detail: `${result.reference} (${seats(result.seats)}) was checked in before. Don't let them in again.`,
      };
    case "no_longer_valid":
      return {
        ok: false,
        title: `Not valid: booking ${result.bookingStatus === "held" ? "not paid" : result.bookingStatus}`,
        detail: `${result.reference} can't be used to get in.`,
      };
    case "wrong_event":
      return {
        ok: false,
        title: "Wrong event",
        detail: "This ticket is for a different event.",
      };
    case "invalid":
      return result.reason === "expired"
        ? {
            ok: false,
            title: "Ticket expired",
            detail: "This ticket is for an event that has ended.",
          }
        : {
            ok: false,
            title: "Not a valid ticket",
            detail:
              "Check the code was copied in full, or ask for the booking reference.",
          };
  }
}

// The result as words first: the icon and the colour only repeat what the
// title says, so nothing depends on seeing colour (WCAG 1.4.1)
function ResultCard({
  result,
  timezone,
}: {
  result: CheckInResult;
  timezone: string;
}) {
  const view = describe(result, timezone);
  return (
    <div
      className={`rounded-lg border-2 bg-surface p-5 ${view.ok ? "border-cat-workshops" : "border-accent"}`}
    >
      <p className={`text-display-sm text-ink ${display}`}>
        <span aria-hidden="true">{view.ok ? "✓ " : "✕ "}</span>
        {view.title}
      </p>
      <p className="mt-2 text-ink-soft">{view.detail}</p>
    </div>
  );
}
