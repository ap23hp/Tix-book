import { randomBytes } from "node:crypto";
import type { Booking, Prisma } from "../generated/prisma/client.js";
import { HttpError } from "./errors.js";
import { enqueueBookingConfirmedEmail } from "./jobs.js";
import { prisma } from "./prisma.js";
import { seatsTakenByEvent } from "./seats.js";

type Db = Prisma.TransactionClient;

// How long a held seat waits for payment (decision 008)
export const HOLD_MINUTES = 5;

// Many people can book the same event at once. Each waits for the event row
// lock, so give transactions more time than Prisma's defaults (2s to start,
// 5s to run) before giving up. The lock itself is only held for milliseconds.
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 10_000 };

// "TIX-7KQ2M9XA": 8 characters from an alphabet without look-alikes
// (no 0/O, 1/I/L), easy to read out at the door. 32^8 ≈ 1 trillion codes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newReference(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return `TIX-${code}`;
}

// The columns we need from the locked event row
type LockedEvent = {
  id: string;
  status: string;
  startsAt: Date;
  seatLimit: number;
  pricePence: number;
};

// Locks one event row until the transaction ends (SELECT ... FOR UPDATE).
// Every booking for this event waits here for the one before it, so two
// requests can't both see "1 seat left" (decision 034). Prisma has no
// FOR UPDATE, so this is raw SQL; ${eventId} is sent as a parameter, not
// pasted into the SQL, so it can't be used for SQL injection.
export async function lockEvent(tx: Db, eventId: string) {
  const rows = await tx.$queryRaw<LockedEvent[]>`
    SELECT id, status, "startsAt", "seatLimit", "pricePence"
    FROM "Event"
    WHERE id = ${eventId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

// Holds whose 5 minutes have passed become EXPIRED (decision 035).
// There's no cron job: this runs whenever a booking is made, read or
// confirmed. Seats left never depends on it, because the seats rule already
// ignores holds that have run out; this only keeps the stored status honest.
export async function expireHolds(
  db: Db,
  where: Prisma.BookingWhereInput,
  now: Date,
) {
  await db.booking.updateMany({
    where: { ...where, status: "HELD", holdExpiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
}

type HoldInput = {
  eventId: string;
  userId: string;
  seats: number;
  idempotencyKey: string;
};

// A key that was used before: same request → the same booking again (200).
// The same key for a different request is a client bug → 422.
function replay(existing: Booking, input: HoldInput) {
  const same =
    existing.userId === input.userId &&
    existing.eventId === input.eventId &&
    existing.seats === input.seats;
  if (!same) {
    throw new HttpError(
      422,
      "This idempotency key was already used for a different booking",
    );
  }
  return { booking: existing, created: false };
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "P2002"
  );
}

// Hold seats (paid event) or book them straight away (free event).
export async function holdSeats(
  input: HoldInput,
): Promise<{ booking: Booking; created: boolean }> {
  // Seen this key before? Answer with that booking, no new one.
  const seen = await prisma.booking.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (seen) return replay(seen, input);

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const event = await lockEvent(tx, input.eventId);
      // Drafts and cancelled events can't be booked; to the public they
      // don't exist (same 404 as GET /events/:id)
      if (!event || event.status !== "PUBLISHED") {
        throw new HttpError(404, "Event not found");
      }

      // Read the clock AFTER getting the lock, so every booking and confirm
      // for this event sees time move forward in the order they ran
      const now = new Date();
      if (event.startsAt <= now) {
        throw new HttpError(409, "This event has already started");
      }

      await expireHolds(tx, { eventId: event.id }, now);

      const taken =
        (await seatsTakenByEvent([event.id], { now, db: tx })).get(event.id) ??
        0;
      const left = event.seatLimit - taken;
      if (input.seats > left) {
        throw new HttpError(
          409,
          left <= 0
            ? "Sold out"
            : `Only ${left} ${left === 1 ? "seat is" : "seats are"} left`,
        );
      }

      // Free events skip the hold (decision 008): nothing to pay
      const isFree = event.pricePence === 0;
      const created = await tx.booking.create({
        data: {
          eventId: event.id,
          userId: input.userId,
          seats: input.seats,
          unitPricePence: event.pricePence,
          idempotencyKey: input.idempotencyKey,
          reference: newReference(),
          status: isFree ? "CONFIRMED" : "HELD",
          holdExpiresAt: isFree
            ? null
            : new Date(now.getTime() + HOLD_MINUTES * 60_000),
        },
      });
      // A free booking is confirmed now, so its email job is saved in the
      // same transaction (paid ones get theirs from the Stripe webhook)
      if (isFree) await enqueueBookingConfirmedEmail(tx, created.id);
      return created;
    }, TRANSACTION_OPTIONS);

    return { booking, created: true };
  } catch (err) {
    // Two requests with the same key at the same moment: both passed the
    // "seen before?" check, the database's unique rule let only one in.
    // The loser answers with the winner's booking.
    if (isUniqueConstraintError(err)) {
      const winner = await prisma.booking.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (winner) return replay(winner, input);
    }
    throw err;
  }
}
