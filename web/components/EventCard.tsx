import Link from "next/link";

// The fields the card needs, matching what GET /api/v1/events returns
export type EventSummary = {
  id: string;
  title: string;
  category: string;
  format: "IN_PERSON" | "ONLINE";
  startsAt: string; // ISO date string from the API
  timezone: string;
  venueName: string | null;
  pricePence: number;
};

type CategoryStyle = { from: string; to: string; dot: string };

// Colours from the design (page 33). Keys are lowercase.
const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  comedy: { from: "#b65e3c", to: "#ebc66e", dot: "#c2683f" },
  music: { from: "#463f7c", to: "#d9a58f", dot: "#5b4e95" },
  business: { from: "#2d465f", to: "#e6d5ae", dot: "#41607d" },
  workshops: { from: "#6c8c6b", to: "#eadfc4", dot: "#5f7f5e" },
};

// Used for any category not in the list (e.g. "Food")
const FALLBACK_STYLE: CategoryStyle = {
  from: "#5e5850",
  to: "#e7e2da",
  dot: "#5e5850",
};

function getCategoryStyle(category: string): CategoryStyle {
  return CATEGORY_STYLES[category.trim().toLowerCase()] ?? FALLBACK_STYLE;
}

function formatPrice(pence: number): string {
  if (pence === 0) return "Free";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100);
}

function formatDateParts(iso: string, timeZone: string) {
  const date = new Date(iso);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).format(date);

  return {
    day: part({ day: "2-digit" }),
    month: part({ month: "short" }),
    weekday: part({ weekday: "short" }),
    time: part({ hour: "2-digit", minute: "2-digit", timeZoneName: "short" }),
  };
}

const display =
  "font-display font-semibold [font-variation-settings:'wdth'_75] tracking-tight";
const label = "font-mono text-label font-medium uppercase tracking-[0.08em]";

export function EventCard({ event }: { event: EventSummary }) {
  const style = getCategoryStyle(event.category);
  const { day, month, weekday, time } = formatDateParts(
    event.startsAt,
    event.timezone,
  );
  const isOnline = event.format === "ONLINE";

  return (
    <Link
      href={`/events/${event.id}`}
      className="flex flex-col rounded-ticket bg-surface shadow-ticket transition duration-160 ease-ticket hover:-translate-y-1 hover:shadow-ticket-lift focus-visible:-translate-y-1 focus-visible:shadow-ticket-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <article className="flex flex-1 flex-col">
        {/* Cover art */}
        <div
          className="relative h-36 rounded-t-ticket"
          style={{
            backgroundImage: `linear-gradient(135deg, ${style.from}, ${style.to})`,
          }}
        >
          <span
            className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-ink ${label}`}
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: style.dot }}
            />
            {event.category}
          </span>

          {isOnline && (
            <span
              className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-surface ${label}`}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-live"
              />
              Online
            </span>
          )}
        </div>

        {/* Details */}
        <div className="px-5 pb-3 pt-4">
          <h3 className={`text-display-sm text-ink ${display}`}>
            {event.title}
          </h3>
          <p className="mt-3 text-sm text-ink-muted">{time}</p>
          <p className="text-sm text-ink-muted">
            {isOnline
              ? "Online"
              : `In person · ${event.venueName ?? "Venue to be announced"}`}
          </p>
        </div>

        {/* Perforation: mt-auto pushes it and the stub to the bottom */}
        <div
          aria-hidden="true"
          className="mx-5 mt-auto border-t-2 border-dashed border-perf"
        />

        {/* Stub: date and price */}
        <div className="flex items-end justify-between px-5 pb-4 pt-3">
          <time dateTime={event.startsAt} className="flex items-center gap-2">
            <span className={`text-display-lg text-ink ${display}`}>{day}</span>
            <span className={`flex flex-col text-ink-muted ${label}`}>
              <span>{month}</span>
              <span>{weekday}</span>
            </span>
          </time>
          <p className={`text-display-sm text-ink ${display}`}>
            {formatPrice(event.pricePence)}
          </p>
        </div>
      </article>
    </Link>
  );
}