import { z } from "zod";

// A cursor marks "the last event the client has seen".
// Events are sorted by startsAt, then id (so two events at the same time
// still have a fixed order). The cursor stores both values.
//
// It's encoded as base64url so the client treats it as an opaque string
// it just sends back, not something to build or edit by hand.

export type EventCursor = { startsAt: Date; id: string };

export function encodeCursor(cursor: EventCursor): string {
  const json = JSON.stringify([cursor.startsAt.toISOString(), cursor.id]);
  return Buffer.from(json).toString("base64url");
}

const cursorSchema = z.tuple([z.iso.datetime(), z.string().min(1).max(100)]);

// Returns null if the cursor is broken or was tampered with
export function decodeCursor(value: string): EventCursor | null {
  try {
    const json: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const result = cursorSchema.safeParse(json);
    if (!result.success) return null;
    const [startsAt, id] = result.data;
    return { startsAt: new Date(startsAt), id };
  } catch {
    return null;
  }
}