import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { runMigrations } from "../../src/event-store/migrate.js";

export interface PgContainerHandle {
  container: StartedPostgreSqlContainer;
  pool: Pool;
  connectionString: string;
  cleanup: () => Promise<void>;
}

/**
 * Boot a disposable Postgres 16 container, return a pool against it.
 * `migrate` controls whether the canonical migration chain runs at
 * startup (default true — every integration test starts from a fully-
 * migrated schema). Pass `migrate: false` when the test itself wants to
 * exercise the migrator (U3 idempotency test).
 */
export async function startPgContainer(
  options: { migrate?: boolean } = {},
): Promise<PgContainerHandle> {
  const { migrate = true } = options;
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const connectionString = container.getConnectionUri();
  const pool = new Pool({ connectionString });
  if (migrate) await runMigrations(pool);
  return {
    container,
    pool,
    connectionString,
    cleanup: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
