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
};

// Built on the native <dialog>. showModal() gives us, from the browser:
// - a focus trap (the rest of the page becomes inert)
// - Escape to close
// - focus moved in on open, and back to the opening button on close
// - the "top layer", so no z-index problems, and a ::backdrop to style
export function Modal({ open, onClose, title, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Prop → dialog: open or close the real <dialog> when `open` changes.
  // Check dialog.open first: showModal() on an open dialog throws.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
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
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-ticket bg-surface text-ink shadow-ticket-lift backdrop:bg-ink/50"
    >
      <div className="p-6">
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
