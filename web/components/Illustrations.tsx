// Decorative drawings for the empty, error and not-found states.
// aria-hidden: screen readers skip them, because the text beside them says everything.

export function SleepingTicket() {
  return (
    <svg viewBox="0 0 200 150" aria-hidden="true" className="w-48 text-ink">
      <g transform="rotate(-6 100 90)">
        <rect x="20" y="45" width="160" height="90" rx="12" className="fill-surface stroke-current" strokeWidth="4" />
        <line x1="132" y1="49" x2="132" y2="131" className="stroke-perf" strokeWidth="3" strokeDasharray="6 6" />
        <path d="M55 88 q8 8 16 0 M85 88 q8 8 16 0" fill="none" className="stroke-current" strokeWidth="3" strokeLinecap="round" />
        <circle cx="80" cy="108" r="4" className="fill-current" />
        <circle cx="156" cy="90" r="7" className="fill-accent" />
      </g>
      <text x="138" y="34" className="fill-current font-display" fontSize="24" fontWeight="800">z</text>
      <text x="158" y="18" className="fill-current font-display" fontSize="15" fontWeight="800">z</text>
    </svg>
  );
}

export function TornTicket() {
  return (
    <svg viewBox="0 0 220 120" aria-hidden="true" className="w-52 text-ink">
      <path d="M15 20 h95 l-10 12 l10 12 l-10 12 l10 12 l-10 12 l10 12 v8 h-95 z" className="fill-surface stroke-current" strokeWidth="4" strokeLinejoin="round" />
      <text x="50" y="80" className="fill-current font-display" fontSize="52" fontWeight="800">?</text>
      <path d="M128 24 h77 v88 h-77 l10 -10 l-10 -12 l10 -12 l-10 -12 l10 -12 l-10 -12 l10 -12 z" className="fill-surface stroke-current" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="172" cy="66" r="7" className="fill-accent" />
    </svg>
  );
}

export function EmptyTicket() {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true" className="w-48 text-ink-muted">
      <rect x="10" y="10" width="180" height="100" rx="14" fill="none" className="stroke-current" strokeWidth="3" strokeDasharray="8 6" />
      <line x1="140" y1="14" x2="140" y2="106" className="stroke-perf" strokeWidth="3" strokeDasharray="6 6" />
      <rect x="35" y="45" width="70" height="8" rx="4" className="fill-line" />
      <rect x="35" y="62" width="50" height="8" rx="4" className="fill-line" />
      <rect x="155" y="58" width="22" height="5" rx="2" className="fill-current" />
    </svg>
  );
}