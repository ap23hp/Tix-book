// Converting between <input type="datetime-local"> and the API's ISO strings.
//
// A datetime-local input has no time zone: "2026-12-05T19:30" just means
// "19:30 on 5 Dec". The browser reads it in ITS OWN time zone, so both
// directions here use the browser's zone (not the event's `timezone` field).
// That's what the create form has always done, so create and edit agree.

// "2026-12-05T19:30" → "2026-12-05T19:30:00.000Z" (if the browser is in London)
export function fromDateTimeLocal(value: string): string | undefined {
  if (value === "") return undefined;
  return new Date(value).toISOString();
}

// "2026-12-05T19:30:00.000Z" → "2026-12-05T19:30" (if the browser is in London).
// Not toISOString().slice(0, 16): that would show the UTC time, not local time.
export function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
