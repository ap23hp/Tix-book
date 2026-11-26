// Lab scripts that write a lot of data must only ever touch the Neon DEV
// branch. Same rule as prisma/seed.ts: the database host must match
// SEED_ALLOWED_HOST in api/.env. Production's host is only in Render, so
// it can't match by accident. Neither value is ever printed in full.
export function assertDevDatabase(): void {
  const url = process.env.DATABASE_URL;
  const allowedHost = process.env.SEED_ALLOWED_HOST;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (process.env.NODE_ENV === "production" || process.env.RENDER) {
    throw new Error("Refusing to run a lab seed in production.");
  }
  const host = new URL(url).hostname;
  if (!allowedHost || host !== allowedHost) {
    throw new Error(
      "Refusing: the database host doesn't match SEED_ALLOWED_HOST in api/.env (the Neon dev host).",
    );
  }
}
