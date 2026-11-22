import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-surface hover:bg-accent-hover",
  secondary: "border border-ink text-ink hover:bg-ink hover:text-surface",
  ghost: "text-ink-soft underline underline-offset-4 hover:text-ink",
};

const sizes: Record<Size, string> = {
  md: "px-7 py-3",
  sm: "px-4 py-2 text-sm",
};

type Style = { variant?: Variant; size?: Size; className?: string };

// The button look as a class string, so a <Link> can look like a button
// and still be a real link (a link goes somewhere, a button does something).
// className is added last; use it for spacing (mt-6, w-full), not colours.
export function buttonClass({
  variant = "primary",
  size = "md",
  className = "",
}: Style = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & Style;

// type defaults to "button": a plain <button> inside a form submits it,
// which is a common accidental bug. Submit buttons say type="submit".
export function Button({
  variant,
  size,
  className,
  type = "button",
  ...buttonProps
}: Props) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, className })}
      {...buttonProps}
    />
  );
}
