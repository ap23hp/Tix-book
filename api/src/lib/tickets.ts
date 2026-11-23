import { errors, jwtVerify, SignJWT } from "jose";

// A ticket is a signed JWT (decision 023), shown as a QR code.
// Anyone can READ a JWT (it's only base64), so it holds no names or emails:
// just which booking it is. The signature (HMAC-SHA256 with our secret)
// means nobody can change it or make a new one without the secret.

const ISSUER = "tixbook";
// "What is this token for?" A token made for something else, signed with
// the same secret, must not work as a ticket.
const AUDIENCE = "ticket";
// Only this algorithm is accepted. Without the list, a forged token saying
// "alg: none" (no signature) could be accepted by a careless verifier.
const ALGORITHM = "HS256";
// A ticket works until a day after the event ends
const VALID_AFTER_END_MS = 24 * 60 * 60 * 1000;

function secretKey(): Uint8Array {
  const secret = process.env.TICKET_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "Tickets are not set up: add TICKET_JWT_SECRET to the environment",
    );
  }
  return new TextEncoder().encode(secret);
}

export type TicketClaims = {
  bookingId: string;
  reference: string;
  eventId: string;
  seats: number;
};

export async function signTicket(
  ticket: TicketClaims,
  eventEndsAt: Date,
): Promise<string> {
  return new SignJWT({
    ref: ticket.reference,
    evt: ticket.eventId,
    seats: ticket.seats,
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(ticket.bookingId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(
      Math.floor((eventEndsAt.getTime() + VALID_AFTER_END_MS) / 1000),
    )
    .sign(secretKey());
}

export type TicketCheck =
  | { ok: true; ticket: TicketClaims }
  | { ok: false; reason: "expired" | "invalid" };

// Checks the signature, algorithm, issuer, audience and expiry.
// This proves WE issued the ticket. It can't say whether the booking was
// refunded since: a JWT can't be taken back, so the caller must also check
// the booking in the database (decision 046).
export async function verifyTicket(token: string): Promise<TicketCheck> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const { sub, ref, evt, seats } = payload;
    if (
      typeof sub !== "string" ||
      typeof ref !== "string" ||
      typeof evt !== "string" ||
      typeof seats !== "number"
    ) {
      return { ok: false, reason: "invalid" };
    }
    return {
      ok: true,
      ticket: { bookingId: sub, reference: ref, eventId: evt, seats },
    };
  } catch (err) {
    if (err instanceof errors.JWTExpired)
      return { ok: false, reason: "expired" };
    // Bad signature, wrong algorithm, wrong audience, not a JWT at all...
    // all the same to a door scanner: not a valid ticket
    return { ok: false, reason: "invalid" };
  }
}
