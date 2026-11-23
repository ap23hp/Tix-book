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
// In the "My events" list, each event also has its seat numbers
// (confirmed + held + left = seatLimit, using the same rule as seats left)
export type MyEventListItem = MyEvent & {
  seatsConfirmed: number;
  // Seats on a hold that is still running
  seatsHeld: number;
  seatsLeft: number;
};

export type MyEventPage = {
  events: MyEventListItem[];
  nextCursor: string | null;
};

// GET /api/v1/events/mine/:id/bookings: one event's dashboard
export type EventDashboard = {
  event: Pick<
    MyEvent,
    | "id"
    | "title"
    | "status"
    | "startsAt"
    | "timezone"
    | "seatLimit"
    | "pricePence"
  >;
  summary: {
    seatsConfirmed: number;
    seatsHeld: number;
    seatsLeft: number;
    revenuePence: number;
  };
  bookings: {
    id: string;
    reference: string;
    status: BookingStatus;
    seats: number;
    totalPence: number;
    createdAt: string;
    attendeeName: string;
  }[];
  // true when there are more bookings than the API returns at once (200)
  hasMore: boolean;
};

export type BookingStatus =
  "HELD" | "CONFIRMED" | "EXPIRED" | "CANCELLED" | "REFUNDED";

// A booking, as GET /api/v1/bookings/:id returns it (api/src/lib/booking-view.ts)
export type Booking = {
  id: string;
  reference: string;
  // A hold that has run out already comes back as EXPIRED
  status: BookingStatus;
  seats: number;
  unitPricePence: number;
  totalPence: number;
  holdExpiresAt: string | null;
  createdAt: string;
  // The server's clock when it answered: the countdown starts from this,
  // not from the browser's clock (decision 008)
  serverTime: string;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    format: EventFormat;
    venueName: string | null;
    venueAddress: string | null;
    // Only filled in once the booking is confirmed
    meetingLink: string | null;
  };
};

export type Role = "ATTENDEE" | "ORGANISER";

// The logged-in user, as returned by GET /api/v1/auth/me
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
};
