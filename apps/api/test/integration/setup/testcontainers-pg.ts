import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { runMigrations } from '../../../src/event-store/migrate';

/**
 * Vitest globalSetup for the kernel integration suite (P1.4) — the user-chosen testcontainers harness
 * for ALL kernel integration slices. Boots ONE real Dockerized Postgres, runs the REAL boot migrator
 * (migrate -> [seed] -> ready), and shares the connection URI with the suite via `provide`/`inject`.
 * One shared container (boot + migrate once) — fast + hermetic; each test isolates with its own keys.
 */

// The connection URI is shared with integration tests via `inject('pgConnectionUri')`.
declare module 'vitest' {
  interface ProvidedContext {
    pgConnectionUri: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

// Vitest 4 does not export the globalSetup context type; type only the `provide` we use (keyed to the
// augmented ProvidedContext above). Vitest invokes this default export, so no external signature check.
export default async function setup(ctx: {
  provide: (key: 'pgConnectionUri', value: string) => void;
}): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const uri = container.getConnectionUri();
  // Exercise the production boot migrator against the real container (migrate -> ready).
  await runMigrations(uri);
  ctx.provide('pgConnectionUri', uri);

  return async () => {
    await container?.stop();
  };
}
