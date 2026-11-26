import { describe, it, expect, afterAll } from "@jest/globals";
import pg from "pg";
import { POOL_OPTIONS, poolConfig, prisma } from "../lib/prisma.js";

// Decision 070: Prisma's pool is small and fails fast when it's full.
describe("Prisma connection pool", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("uses at most 5 connections and waits at most 5 s for one", () => {
    expect(poolConfig("postgres://example")).toEqual({
      connectionString: "postgres://example",
      max: 5,
      connectionTimeoutMillis: 5000,
    });
  });

  it("still answers queries with the real pool", async () => {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(rows).toEqual([{ ok: 1 }]);
  });

  // What connectionTimeoutMillis buys us: a full pool gives an error, not a
  // request that hangs. Same options, but 1 connection and 300 ms, so the
  // test is quick and uses only one connection of the dev database.
  it("a full pool fails with a timeout instead of waiting forever", async () => {
    const pool = new pg.Pool({
      ...poolConfig(process.env.DATABASE_URL),
      max: 1,
      connectionTimeoutMillis: 300,
    });
    const busy = await pool.connect();
    try {
      const started = Date.now();
      await expect(pool.connect()).rejects.toThrow(/timeout/i);
      expect(Date.now() - started).toBeLessThan(2000);
    } finally {
      busy.release();
      await pool.end();
    }
  });

  it("the timeout is on (pg's default 0 means wait forever)", () => {
    expect(POOL_OPTIONS.connectionTimeoutMillis).toBeGreaterThan(0);
  });
});
