import { useId, type SelectHTMLAttributes } from "react";
import { fieldClass } from "@/components/ui/Input";

export type Option = { value: string; label: string };

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: readonly Option[];
  error?: string;
};

// A labelled native <select>. Native, not a custom dropdown: keyboard,
// screen readers and mobile pickers all work without extra code.
export function Select({
  label,
  options,
  error,
  id,
  className = "",
  ...selectProps
}: Props) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const errorId = `${selectId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${fieldClass} ${className}`.trim()}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="text-sm text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
