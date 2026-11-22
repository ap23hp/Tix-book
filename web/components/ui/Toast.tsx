"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";

export type ToastTone = "success" | "error";
type ToastInput = { message: string; tone?: ToastTone };
type ToastItem = { id: number; message: string; tone: ToastTone };

const DURATION_MS = 5000;

// The context holds only the toast() function, never the list of toasts.
// The function never changes (useCallback with no dependencies), so
// components that call useToast() don't re-render when toasts come and go.
const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast() must be used inside <ToastProvider>");
  return toast;
}

// Lives in the root layout, which stays mounted across navigations,
// so a toast shown just before router.push() is still visible after it.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const toast = useCallback(({ message, tone = "success" }: ToastInput) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { id, message, tone }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = (tone: ToastTone) =>
    toasts
      .filter((item) => item.tone === tone)
      .map((item) => (
        <ToastMessage key={item.id} toast={item} onDismiss={dismiss} />
      ));

  return (
    <ToastContext value={toast}>
      {children}

      {/* Both live regions are always in the page, even when empty.
          Screen readers only announce changes inside a region they already
          know about; a region added together with its message is often missed.
          aria-atomic="false": read only the new toast, not the whole region
          (role="status" and role="alert" default to reading everything). */}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-96">
        <div role="status" aria-atomic="false" className="flex flex-col gap-2">
          {show("success")}
        </div>
        <div role="alert" aria-atomic="false" className="flex flex-col gap-2">
          {show("error")}
        </div>
      </div>
    </ToastContext>
  );
}

function ToastMessage({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  // Pause the timer while the mouse is over the toast or focus is inside it,
  // so people who need longer to read it (or reach the button) get the time
  // (WCAG 2.2.1 Timing Adjustable).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), DURATION_MS);
    return () => clearTimeout(timer); // paused or dismissed: stop the old timer
  }, [paused, toast.id, onDismiss]);

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    // Ignore focus moving between elements inside this toast
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface p-4 text-sm text-ink shadow-ticket-lift"
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${
          toast.tone === "error" ? "bg-accent" : "bg-cat-workshops"
        }`}
      />
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="-m-1 rounded-full p-1 text-ink-muted hover:text-ink"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
