import { serve } from "@hono/node-server";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { z } from "zod";
import { runMigrations } from "../src/event-store/migrate.js";
import {
  SchemaVersionMismatchError,
  SeedRefusedError,
  seedDemo,
} from "../src/event-store/scripts/seed-demo.js";
import { createServer } from "../src/http/server.js";
import { Worker } from "../src/runtime/worker.js";

/**
 * Phase D unified demo boot script (PD.3 / U7).
 *
 *   1. Zod-validate env → fail-fast with a named error if DATABASE_URL is missing.
 *   2. runMigrations(pool) — the canonical 0000..0005 chain.
 *   3. If DOPPL_DEMO_FIXTURE is set, seed a replay fixture into the DB.
 *   4. createServer({ db }).listen(PORT).
 *   5. new Worker({ db, processRun }).start() — placeholder processRun
 *      marks configured runs failed with a clear instruction. The
 *      live-run wiring is a Phase D follow-up; the demo's primary
 *      operator path is the replay rung, which doesn't traverse
 *      processRun.
 *   6. Langfuse absence is non-blocking (local-trace fallback is the
 *      gateway's responsibility, plumbed in Phase 2).
 *
 * Invoke via `pnpm --filter @doppl/api boot:demo`.
 */

const BootEnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DOPPL_DEMO_FIXTURE: z.string().optional(),
    DOPPL_DEMO_HTTP_PORT: z
      .string()
      .optional()
      .transform((v) => (v ? Number.parseInt(v, 10) : 3000)),
    DOPPL_HTTP_PORT: z
      .string()
      .optional()
      .transform((v) => (v ? Number.parseInt(v, 10) : undefined)),
    OPENAI_API_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    LANGFUSE_PUBLIC_KEY: z.string().optional(),
    LANGFUSE_SECRET_KEY: z.string().optional(),
    LANGFUSE_BASE_URL: z.string().optional(),
  })
  .passthrough();

export type BootEnv = z.infer<typeof BootEnvSchema>;

export interface BootDemoResult {
  port: number;
  fixtureLoaded: { runId: string; eventsLoaded: number } | null;
  langfuseMode: "cloud" | "local-trace";
  shutdown: () => Promise<void>;
}

export class BootEnvError extends Error {
  public readonly issues: { path: string; message: string }[];
  constructor(issues: { path: string; message: string }[]) {
    super(`boot-demo refused: env validation failed (${issues.map((i) => i.path).join(", ")})`);
    this.name = "BootEnvError";
    this.issues = issues;
  }
}

export interface BootDemoOptions {
  /** Override env for tests. */
  env?: NodeJS.ProcessEnv;
  /** Pre-built pg pool (tests). */
  pool?: pg.Pool;
}

async function placeholderProcessRun(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: ReturnType<typeof drizzle>,
  runId: string,
): Promise<void> {
  // The MVP demo path is replay-served. Live runs would require the
  // gateway + generation-loop wiring; flagging configured live runs
  // as failed with a clear pointer keeps the queue draining.
  await db.execute(sql`
    UPDATE runs
    SET status = 'failed',
        completed_at = NOW(),
        terminal_summary = 'live processRun not wired in boot-demo MVP — use POST /demo/runs/replay/:fixtureId for the demo path'
    WHERE id = ${runId}
  `);
}

function detectLangfuseMode(env: NodeJS.ProcessEnv): "cloud" | "local-trace" {
  return env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY ? "cloud" : "local-trace";
}

export async function bootDemo(options: BootDemoOptions = {}): Promise<BootDemoResult> {
  const env = options.env ?? process.env;
  const parsed = BootEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));
    throw new BootEnvError(issues);
  }
  const bootEnv = parsed.data;

  const pool = options.pool ?? new pg.Pool({ connectionString: bootEnv.DATABASE_URL });

  await runMigrations(pool);
  const db = drizzle(pool);

  let fixtureLoaded: BootDemoResult["fixtureLoaded"] = null;
  if (bootEnv.DOPPL_DEMO_FIXTURE) {
    try {
      const result = await seedDemo({ db, fixturePath: bootEnv.DOPPL_DEMO_FIXTURE });
      fixtureLoaded = { runId: result.runId, eventsLoaded: result.eventsLoaded };
    } catch (err) {
      if (!options.pool) await pool.end();
      if (err instanceof SchemaVersionMismatchError || err instanceof SeedRefusedError) {
        throw err;
      }
      throw err;
    }
  }

  const app = createServer({ db });
  const port = bootEnv.DOPPL_HTTP_PORT ?? bootEnv.DOPPL_DEMO_HTTP_PORT;
  const server = serve({ fetch: app.fetch, port });

  const worker = new Worker({
    db,
    processRun: (runId) => placeholderProcessRun(db, runId),
    disableHeartbeat: false,
  });
  // Worker.start() is a forever loop; intentionally not awaited so
  // bootDemo can return control. The loop terminates on worker.stop().
  const workerLoop = worker.start();
  workerLoop.catch((err: unknown) => {
    process.stderr.write(`Worker loop crashed: ${String(err)}\n`);
  });

  const shutdown = async (): Promise<void> => {
    await worker.stop();
    await workerLoop.catch(() => {});
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    if (!options.pool) await pool.end();
  };

  return {
    port,
    fixtureLoaded,
    langfuseMode: detectLangfuseMode(env),
    shutdown,
  };
}

async function main(): Promise<void> {
  try {
    const result = await bootDemo();
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          port: result.port,
          fixtureLoaded: result.fixtureLoaded,
          langfuseMode: result.langfuseMode,
        },
        null,
        2,
      )}\n`,
    );
    process.stdout.write(`API listening on http://localhost:${result.port}\n`);
    // Hold the process open; SIGINT/SIGTERM trigger graceful shutdown.
    const onSignal = async (sig: NodeJS.Signals): Promise<void> => {
      process.stdout.write(`\nReceived ${sig} — shutting down\n`);
      await result.shutdown();
      process.exit(0);
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`boot-demo failed: ${msg}\n`);
    process.exit(1);
  }
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("boot-demo.ts");
if (invokedDirectly) {
  void main();
}
