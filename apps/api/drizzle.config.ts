import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/event-store/schema.ts",
  out: "./src/event-store/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://doppl:doppl@localhost:5434/doppl_dev",
  },
  // The append-only trigger (U6) ships as a manual SQL migration file;
  // drizzle-kit does not model triggers natively. Do not delete that file
  // when regenerating — see `src/event-store/migrations/README.md`.
});
