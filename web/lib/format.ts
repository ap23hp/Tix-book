type CategoryStyle = { from: string; to: string; dot: string };

// Colours from the design (page 33). Keys are lowercase.
const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  comedy: { from: "#b65e3c", to: "#ebc66e", dot: "#c2683f" },
  music: { from: "#463f7c", to: "#d9a58f", dot: "#5b4e95" },
  business: { from: "#2d465f", to: "#e6d5ae", dot: "#41607d" },
  workshops: { from: "#6c8c6b", to: "#eadfc4", dot: "#5f7f5e" },
};

// Used for any category not in the list (e.g. "Food")
const FALLBACK_STYLE: CategoryStyle = { from: "#5e5850", to: "#e7e2da", dot: "#5e5850" };

export function getCategoryStyle(category: string): CategoryStyle {
  return CATEGORY_STYLES[category.trim().toLowerCase()] ?? FALLBACK_STYLE;
}

export function formatPrice(pence: number): string {
  if (pence === 0) return "Free";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100);
}

// Format a date in the event's own timezone (GMT in winter, BST in summer)
export function formatInZone(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).format(new Date(iso));
}

export function formatDateParts(iso: string, timeZone: string) {
  return {
    day: formatInZone(iso, timeZone, { day: "2-digit" }),
    month: formatInZone(iso, timeZone, { month: "short" }),
    weekday: formatInZone(iso, timeZone, { weekday: "short" }),
    year: formatInZone(iso, timeZone, { year: "numeric" }),
    time: formatInZone(iso, timeZone, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }),
  };
}

// "20:00 – 22:00 GMT"
export function formatTimeRange(startIso: string, endIso: string, timeZone: string): string {
  const start = formatInZone(startIso, timeZone, { hour: "2-digit", minute: "2-digit" });
  const end = formatInZone(endIso, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `${start} – ${end}`;
}