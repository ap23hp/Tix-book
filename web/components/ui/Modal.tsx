"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { display } from "@/lib/ui";

type Props = {
  open: boolean;
  // Called when the user asks to close (Escape or the × button).
  // The parent must set `open` to false; the Modal never closes itself
  // without telling the parent.
  onClose: () => void;
  title: string;
  children: ReactNode;
  // Cover the whole screen (e.g. a ticket QR shown at the door) instead of
  // a box in the middle
  fullScreen?: boolean;
};

const BOX =
  "m-auto w-[calc(100%-2rem)] max-w-lg rounded-ticket shadow-ticket-lift";
// The browser gives <dialog> a max size a little smaller than the screen:
// lift it, and use dvh (the height that's really visible on phones, with
// the address bar showing)
const FULL_SCREEN = "m-0 h-dvh max-h-none w-screen max-w-none";

// Built on the native <dialog>. showModal() gives us, from the browser:
// - a focus trap (the rest of the page becomes inert)
// - Escape to close
// - focus moved in on open, and back to the opening button on close
// - the "top layer", so no z-index problems, and a ::backdrop to style
export function Modal({
  open,
  onClose,
  title,
  children,
  fullScreen = false,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Prop → dialog: open or close the real <dialog> when `open` changes.
  // Check dialog.open first: showModal() on an open dialog throws.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();

    // Cleanup: close the real dialog when this page is hidden. Next.js hides
    // the page you leave (<Activity>) instead of removing it, and a dialog
    // opened with showModal() stays modal while hidden: invisible, but it
    // makes the whole new page inert, so no clicks reach it. The browser's
    // "close" event then tells the parent (handleClose below).
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  // Dialog → prop: the browser closed it by itself (Escape). Tell the parent,
  // or it would still think the modal is open and could never open it again.
  // If we closed it (open is already false), there's nothing to report.
  function handleClose() {
    if (open) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleClose}
      // Tailwind's reset removes the browser's centring margin, so add m-auto
      className={`${fullScreen ? FULL_SCREEN : BOX} bg-surface text-ink backdrop:bg-ink/50`}
    >
      <div className={fullScreen ? "p-4" : "p-6"}>
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className={`text-display-sm text-ink ${display}`}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 rounded-full p-2 text-ink-muted hover:text-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
