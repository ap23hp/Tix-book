import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";

// The ownership check (IDOR protection), used by every "my event" route.
// The id comes from the URL or body, so anyone can send any id: load the
// event and compare its owner with the logged-in user. An unknown id and
// someone else's event get the same 404, so the API never confirms that
// another organiser's event exists (decision 032).
//
// `id` is unknown on purpose: after middleware, Express only types
// req.params.id as string | string[] | undefined, so check it here once.
export async function findOwnEvent(id: unknown, organiserId: string) {
  if (typeof id !== "string") throw new HttpError(404, "Event not found");

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event || event.organiserId !== organiserId) {
    throw new HttpError(404, "Event not found");
  }
  return event;
}
