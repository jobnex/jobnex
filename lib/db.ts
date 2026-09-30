import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./db/schema";

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __dbInstance: NodePgDatabase<typeof schema> | undefined;
}

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

function createPool(): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL or DIRECT_URL is required to initialize the database pool.");
  }

  const newPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Required for Neon SSL
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000, // 15s to allow Neon serverless compute cold-starts
    keepAlive: true,
  });

  newPool.on("error", (err) => {
    console.error("Unexpected error on idle pg client in pool:", err);
  });

  try {
    attachDatabasePool(newPool);
  } catch {
    // Non-fatal outside Vercel runtime
  }

  return newPool;
}

const pool = globalThis.__dbPool ?? (globalThis.__dbPool = createPool());

export { pool };
export const db = globalThis.__dbInstance ?? (globalThis.__dbInstance = drizzle(pool, { schema }));

