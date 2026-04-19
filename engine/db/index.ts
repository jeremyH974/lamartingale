import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// ============================================================================
// Database client — Neon HTTP driver (serverless-compatible)
// ============================================================================

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('[DB] DATABASE_URL not set. Add it to .env');
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

// Lazy singleton
let _db: ReturnType<typeof getDb> | null = null;

export function db() {
  if (!_db) _db = getDb();
  return _db;
}

// Helper for error handling
export async function withDb<T>(fn: (database: ReturnType<typeof getDb>) => Promise<T>): Promise<T> {
  try {
    return await fn(db());
  } catch (error: any) {
    console.error(`[DB] Query failed: ${error.message}`);
    throw error;
  }
}

export { schema };
