import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/**
 * Boot migrator (ARCHITECTURE.md §9) — runs the SAME ordered migration chain local + hosted as the
 * first step of boot (migrate -> [seed] -> start). Idempotent: drizzle's migrator tracks applied
 * migrations in `__drizzle_migrations`, so re-running against an already-migrated DB is a clean no-op.
 * Reachable at app boot (server entry wires migrate -> seed -> start in P3) and from the integration
 * test harness before each run. The full boot sequence wiring lands with the runtime/worker (P3).
 */

const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}
