import { getCategoryStyle } from "@/lib/format";
import { label } from "@/lib/ui";
import type { EventFormat } from "@/lib/types";

export function CoverArt({
  category,
  format,
  className = "",
}: {
  category: string;
  format: EventFormat;
  className?: string;
}) {
  const style = getCategoryStyle(category);

  return (
    <div
      className={`relative ${className}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${style.from}, ${style.to})` }}
    >
      <span
        className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-ink ${label}`}
      >
        <span aria-hidden="true" className="size-2 rounded-xs" style={{ backgroundColor: style.dot }} />
        {category}
      </span>

      {format === "ONLINE" && (
        <span
          className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-surface ${label}`}
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-live" />
          Online
        </span>
      )}
    </div>
  );
}