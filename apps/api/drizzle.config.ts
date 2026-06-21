import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config (P1.4) — used by `pnpm db:generate` to emit the SQL migration chain from the
 * Drizzle table defs. Migrations are APPLIED by the programmatic boot migrator (src/event-store/
 * migrate.ts), not by drizzle-kit, so no dbCredentials are needed here (generate is offline).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/event-store/schema.ts',
  out: './src/event-store/migrations',
});
