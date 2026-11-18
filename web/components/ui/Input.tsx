import { useId, type InputHTMLAttributes } from "react";

export const fieldClass =
  "rounded-lg border border-line bg-surface px-4 py-3 text-ink aria-invalid:border-accent";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

// One labelled input. The hint and the error are linked to the input
// (aria-describedby), so screen readers read them out with the field.
// The id comes from useId(), not from `name`: hidden pages stay in the DOM
// (<Activity>), so two forms with a field called "email" would share an id.
export function Input({
  label,
  hint,
  error,
  id,
  className = "",
  ...inputProps
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy =
    [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${fieldClass} ${className}`.trim()}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
