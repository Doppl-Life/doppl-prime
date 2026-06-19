import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createPool } from "./connection.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(here, "migrations");

/**
 * Apply every committed migration in `src/event-store/migrations/` against
 * the supplied pool, idempotently. Drizzle's `__drizzle_migrations` table
 * tracks applied versions, so re-running this function against an
 * already-migrated DB is a clean no-op.
 *
 * The same chain runs locally (docker-compose Postgres) and on any hosted
 * Postgres at boot — `migrate → seed → start` is the §15 boot sequence.
 */
export async function runMigrations(pool: pg.Pool): Promise<void> {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

/**
 * CLI entry — runs migrations against `DATABASE_URL`. Invoked via the
 * `db:migrate` package script. Exits with a clear error if the env var
 * is missing (the §15 fail-fast-at-boot pin).
 */
async function main(): Promise<void> {
  const pool = createPool();
  try {
    await runMigrations(pool);
    process.stdout.write("Migrations applied.\n");
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    process.stderr.write(`migration failed: ${String(err)}\n`);
    process.exit(1);
  });
}
