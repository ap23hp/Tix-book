export type EventFormat = "IN_PERSON" | "ONLINE";

// Fields returned by GET /api/v1/events
export type EventSummary = {
  id: string;
  title: string;
  category: string;
  format: EventFormat;
  startsAt: string; // ISO date string
  timezone: string;
  venueName: string | null;
  pricePence: number;
};

// Extra fields returned by GET /api/v1/events/:id
export type EventDetail = EventSummary & {
  description: string;
  endsAt: string;
  doorsAt: string | null;
  venueAddress: string | null;
  seatLimit: number;
  seatsLeft: number;
};