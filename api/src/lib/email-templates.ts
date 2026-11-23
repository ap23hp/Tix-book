// The emails we send: a plain-text and an HTML version of each.
// Rules (decision 049):
// - Link to My tickets, never put the ticket in the email: no QR code, no
//   ticket JWT, no meeting link. Emails get forwarded and sit in inboxes for
//   years; the ticket stays behind the login.
// - Event titles and venues are typed by organisers, so everything that goes
//   into the HTML is escaped. Otherwise a title like "<a href=...>" would
//   become a real link in the attendee's inbox.

export type BookingEmailData = {
  attendeeName: string;
  reference: string;
  seats: number;
  eventTitle: string;
  startsAt: Date;
  timezone: string;
  format: "IN_PERSON" | "ONLINE";
  venueName: string | null;
  venueAddress: string | null;
};

export type EmailContent = { subject: string; text: string; html: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "Saturday, 5 December 2026 at 19:00", in the event's own time zone
export function formatEventTime(startsAt: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  try {
    return startsAt.toLocaleString("en-GB", { ...options, timeZone: timezone });
  } catch {
    // An unknown time zone name throws a RangeError. The app is UK-based,
    // so show London time rather than fail the email.
    return startsAt.toLocaleString("en-GB", {
      ...options,
      timeZone: "Europe/London",
    });
  }
}

function where(data: BookingEmailData): string {
  if (data.format === "ONLINE") {
    return "Online. The joining link is on your ticket in My tickets.";
  }
  return [data.venueName, data.venueAddress].filter(Boolean).join(", ");
}

function seatsText(seats: number): string {
  return seats === 1 ? "1 seat" : `${seats} seats`;
}

type Parts = {
  subject: string;
  intro: string;
  data: BookingEmailData;
  myTicketsUrl: string;
};

// Both emails share one layout; only the subject and first line differ.
function render({ subject, intro, data, myTicketsUrl }: Parts): EmailContent {
  const details: [string, string][] = [
    ["Event", data.eventTitle],
    ["When", formatEventTime(data.startsAt, data.timezone)],
    ["Where", where(data)],
    ["Seats", seatsText(data.seats)],
    ["Booking reference", data.reference],
  ];

  const text = [
    `Hi ${data.attendeeName},`,
    "",
    intro,
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    "",
    `Your ticket and QR code are in My tickets: ${myTicketsUrl}`,
    "",
    "Tixbook",
  ].join("\n");

  const rows = details
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:4px 12px 4px 0">${escapeHtml(label)}</th><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="en">
<body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
<p>Hi ${escapeHtml(data.attendeeName)},</p>
<p>${escapeHtml(intro)}</p>
<table role="presentation">${rows}</table>
<p><a href="${escapeHtml(myTicketsUrl)}">See your ticket in My tickets</a></p>
<p>Tixbook</p>
</body>
</html>`;

  return { subject, text, html };
}

export function bookingConfirmedEmail(
  data: BookingEmailData,
  webUrl: string,
): EmailContent {
  return render({
    subject: `Booking confirmed: ${data.eventTitle}`,
    intro: "Your booking is confirmed.",
    data,
    myTicketsUrl: `${webUrl}/my-tickets`,
  });
}

export function eventReminderEmail(
  data: BookingEmailData,
  webUrl: string,
): EmailContent {
  return render({
    subject: `Reminder: ${data.eventTitle} is coming up`,
    intro: "A reminder that your event is coming up soon.",
    data,
    myTicketsUrl: `${webUrl}/my-tickets`,
  });
}
