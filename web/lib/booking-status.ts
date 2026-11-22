import type { Tone } from "@/components/ui/Badge";
import type { BookingStatus } from "@/lib/types";

// One place for how a booking status looks (badge text and colour), used by
// the booking page and My tickets
export const BOOKING_STATUS: Record<
  BookingStatus,
  { label: string; tone: Tone }
> = {
  HELD: { label: "Held", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "accent" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};
