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
// One page of GET /api/v1/events
export type EventPage = {
  events: EventSummary[];
  // Send this back as ?cursor= to get the next page; null on the last page
  nextCursor: string | null;
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
export type Role = "ATTENDEE" | "ORGANISER";

// The logged-in user, as returned by GET /api/v1/auth/me
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
};
