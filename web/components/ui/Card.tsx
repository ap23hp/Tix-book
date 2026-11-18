import type { ReactNode } from "react";

type Props = {
  // Pick the element that matches the meaning: "article" for a thing that
  // makes sense on its own (one event), "section" for a part of the page.
  as?: "div" | "section" | "article";
  className?: string;
  children: ReactNode;
};

// A white box with a border and padding. The ticket-shaped EventCard is
// separate; this is for plain panels (forms, summaries, empty states).
export function Card({ as: Tag = "div", className = "", children }: Props) {
  return (
    <Tag
      className={`rounded-ticket border border-line bg-surface p-6 shadow-ticket ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}
