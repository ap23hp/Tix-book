import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "../generated/prisma/client.js";

// Prisma 7 uses the driver's pool (pg.Pool), so its size is set here, not
// with `connection_limit` in the URL (decision 070). Without these, pg's
// defaults apply: 10 connections, and a request waits FOREVER for a free
// one when all are busy.
export const POOL_OPTIONS = {
  // One API instance doesn't need 10. pg-boss has its own 3 (jobs.ts), so
  // at most 8 of the 105 connections Neon's smallest compute allows us.
  max: 5,
  // All 5 busy for 5 s: fail with an error (a 500 the logs show) instead of
  // leaving the request hanging until the browser gives up
  connectionTimeoutMillis: 5000,
} satisfies PoolConfig;

export function poolConfig(connectionString: string | undefined): PoolConfig {
  return { connectionString, ...POOL_OPTIONS };
}

const adapter = new PrismaPg(poolConfig(process.env.DATABASE_URL));

export const prisma = new PrismaClient({ adapter });
