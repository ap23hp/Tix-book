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
  seatLimit: number;
  // Calculated by the API (api/src/lib/seats.ts), same as on the event page
  seatsLeft: number;
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
};
export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";

// The whole event, as its organiser sees it
// (GET /api/v1/events/mine and /mine/:id): any status, with the meeting link
export type MyEvent = {
  id: string;
  title: string;
  description: string;
  category: string;
  format: EventFormat;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  doorsAt: string | null;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  meetingLink: string | null;
  pricePence: number;
  seatLimit: number;
};
export type MyEventPage = { events: MyEvent[]; nextCursor: string | null };

export type Role = "ATTENDEE" | "ORGANISER";

// The logged-in user, as returned by GET /api/v1/auth/me
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
};
