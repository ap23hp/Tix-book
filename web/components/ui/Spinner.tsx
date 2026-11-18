type Props = {
  // What is loading, read out by screen readers ("Loading events")
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

const sizes = { sm: "size-4", md: "size-6" };

// A spinning circle. The circle itself is hidden from screen readers;
// they read the label instead, from a role="status" (polite live region).
export function Spinner({
  label = "Loading",
  size = "md",
  className = "",
}: Props) {
  return (
    <span role="status" className={`inline-flex items-center ${className}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className={`${sizes[size]} animate-spin text-accent motion-reduce:animate-none`}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="3"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
