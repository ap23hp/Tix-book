import type { ReactNode } from "react";

export type Tone = "neutral" | "success" | "warning" | "accent";

// Colour lives only in the small dot. The text is always dark ink, so it
// passes contrast on any tone, and colour is never the only signal:
// the word ("Draft", "Published") says the status.
const dots: Record<Tone, string> = {
  neutral: "bg-ink-muted",
  success: "bg-cat-workshops",
  warning: "bg-cat-comedy",
  accent: "bg-accent",
};

type Props = { tone?: Tone; children: ReactNode };

export function Badge({ tone = "neutral", children }: Props) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-xs font-medium uppercase tracking-[0.08em] text-ink">
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${dots[tone]}`}
      />
      {children}
    </span>
  );
}
