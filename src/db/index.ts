/**
 * Database Client
 *
 * Singleton Drizzle ORM instance with PostgreSQL connection pooling.
 *
 * WHY SINGLETON:
 * Next.js in development mode hot-reloads modules, which would create
 * a new connection pool on every reload — exhausting PostgreSQL's
 * max_connections limit quickly. The global singleton pattern prevents this.
 *
 * CONNECTION POOL SIZING:
 * Supabase free tier allows up to 60 concurrent connections.
 * We reserve headroom for the WebSocket server and migrations.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Prevent multiple pool instances in Next.js development hot-reload
const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 10,               // Max connections in pool
    idleTimeoutMillis: 30_000,  // Release idle connections after 30s
    connectionTimeoutMillis: 10_000, // Fail fast if DB is unreachable
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false } // Required for Supabase SSL
        : false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

/**
 * Drizzle ORM database instance.
 *
 * Usage:
 *   import { db } from "@/db";
 *   const docs = await db.select().from(documents).where(eq(documents.ownerId, userId));
 */
export const db = drizzle(pool, {
  schema,
  logger: process.env.NODE_ENV === "development",
});

/**
 * Health check — ping the database.
 * Used by API routes to verify DB connectivity.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export { pool };
