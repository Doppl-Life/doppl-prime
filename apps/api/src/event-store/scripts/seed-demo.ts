import { readFile } from "node:fs/promises";
import { CONTRACTS_SCHEMA_VERSION, type RunEventEnvelope } from "@doppl/contracts";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ReplayArtifact } from "./dump-replay.js";

/**
 * Prepared-replay loader (PD.2). Reads a `dump-replay`-produced JSON
 * artifact and materializes the run + its events into the local DB so
 * the dashboard can serve it as a recorded run (mode='replay'). Runs
 * strictly AFTER migrations.
 *
 * Forward-schema policy: a fixture whose `schemaVersion` exceeds
 * `CONTRACTS_SCHEMA_VERSION` is rejected with a re-record instruction.
 * The MVP policy is re-record, not upcast (see plan D scope §Deferred).
 *
 * Idempotent. Re-seeding the same fixture is a no-op:
 *   - `runs` row uses ON CONFLICT (id) DO NOTHING.
 *   - `run_events` rows use ON CONFLICT (run_id, sequence) DO NOTHING.
 *   The append-only trigger (0001) blocks UPDATE / DELETE but inserts
 *   of historical rows are explicitly allowed.
 */

export class SchemaVersionMismatchError extends Error {
  public readonly fixtureVersion: number;
  public readonly currentVersion: number;
  constructor(fixtureVersion: number) {
    super(
      `seed-demo refused: fixture schemaVersion ${fixtureVersion} > current ${CONTRACTS_SCHEMA_VERSION}. MVP policy is re-record (not upcast) — re-capture this fixture against the current build with dump-replay.`,
    );
    this.name = "SchemaVersionMismatchError";
    this.fixtureVersion = fixtureVersion;
    this.currentVersion = CONTRACTS_SCHEMA_VERSION;
  }
}

export class MigrationsMissingError extends Error {
  public readonly missingTables: string[];
  constructor(missingTables: string[]) {
    super(
      `seed-demo refused: required tables missing (${missingTables.join(", ")}). Run migrations first: pnpm --filter @doppl/api db:migrate`,
    );
    this.name = "MigrationsMissingError";
    this.missingTables = missingTables;
  }
}

export class SeedRefusedError extends Error {
  constructor(reason: string) {
    super(`seed-demo refused: ${reason}`);
    this.name = "SeedRefusedError";
  }
}

export interface SeedDemoInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  fixturePath: string;
}

export interface SeedDemoResult {
  runId: string;
  eventsLoaded: number;
  eventsSkipped: number;
  schemaVersion: number;
}

const REQUIRED_TABLES = ["runs", "run_events", "worker_heartbeats"] as const;

async function assertMigrationsRun(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
): Promise<void> {
  const result = await db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('runs', 'run_events', 'worker_heartbeats')`,
  );
  const present = new Set(result.rows.map((r) => r.table_name));
  const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
  if (missing.length > 0) {
    throw new MigrationsMissingError(missing);
  }
}

function parseArtifact(raw: string, path: string): ReplayArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SeedRefusedError(
      `fixture at ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new SeedRefusedError(`fixture at ${path} is not a JSON object`);
  }
  const artifact = parsed as Partial<ReplayArtifact>;
  if (
    typeof artifact.runId !== "string" ||
    typeof artifact.schemaVersion !== "number" ||
    !Array.isArray(artifact.events)
  ) {
    throw new SeedRefusedError(
      `fixture at ${path} is missing required fields (runId / schemaVersion / events[])`,
    );
  }
  return artifact as ReplayArtifact;
}

export async function seedDemo(input: SeedDemoInput): Promise<SeedDemoResult> {
  await assertMigrationsRun(input.db);

  const raw = await readFile(input.fixturePath, "utf-8");
  const artifact = parseArtifact(raw, input.fixturePath);

  if (artifact.schemaVersion > CONTRACTS_SCHEMA_VERSION) {
    throw new SchemaVersionMismatchError(artifact.schemaVersion);
  }
  if (artifact.events.length === 0) {
    throw new SeedRefusedError(`fixture at ${input.fixturePath} has zero events`);
  }

  // Pull the final config from run.configured event if present.
  const configuredEvent = artifact.events.find((e) => e.type === "run.configured");
  const configJson =
    configuredEvent &&
    typeof configuredEvent.payload === "object" &&
    configuredEvent.payload !== null &&
    "config" in configuredEvent.payload
      ? (configuredEvent.payload as { config: unknown }).config
      : {};

  // Insert (or no-op) the runs row at terminal status with mode='replay'.
  // ON CONFLICT (id) DO NOTHING so re-seeding is idempotent and never
  // mutates a prior rung's run row.
  await input.db.execute(sql`
    INSERT INTO runs (id, status, config, mode, completed_at)
    VALUES (
      ${artifact.runId},
      'completed',
      ${sql.raw(`'${JSON.stringify(configJson).replace(/'/g, "''")}'::jsonb`)},
      'replay',
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `);

  let eventsLoaded = 0;
  let eventsSkipped = 0;
  for (const envelope of artifact.events) {
    const result = await insertEnvelope(input.db, envelope);
    if (result === "inserted") eventsLoaded += 1;
    else eventsSkipped += 1;
  }

  return {
    runId: artifact.runId,
    eventsLoaded,
    eventsSkipped,
    schemaVersion: artifact.schemaVersion,
  };
}

async function insertEnvelope(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  envelope: RunEventEnvelope,
): Promise<"inserted" | "skipped"> {
  const payloadJson = JSON.stringify(envelope.payload).replace(/'/g, "''");
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO run_events
      (id, run_id, sequence, occurred_at, type, actor, payload, schema_version,
       correlation_id, langfuse_trace_id, langfuse_observation_id,
       generation_id, agenome_id, candidate_id)
    VALUES (
      ${envelope.id},
      ${envelope.runId},
      ${envelope.sequence},
      ${envelope.occurredAt},
      ${envelope.type},
      ${envelope.actor},
      ${sql.raw(`'${payloadJson}'::jsonb`)},
      ${envelope.schemaVersion},
      ${envelope.correlationId ?? null},
      ${envelope.langfuseTraceId ?? null},
      ${envelope.langfuseObservationId ?? null},
      ${envelope.generationId ?? null},
      ${envelope.agenomeId ?? null},
      ${envelope.candidateId ?? null}
    )
    ON CONFLICT (run_id, sequence) DO NOTHING
    RETURNING id
  `);
  return result.rows.length > 0 ? "inserted" : "skipped";
}

export async function seedDemoCli(argv: readonly string[]): Promise<number> {
  const fixturePath = argv[0];
  if (!fixturePath) {
    process.stderr.write("usage: seed-demo <fixturePath>\n");
    return 1;
  }
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write("DATABASE_URL is required\n");
    return 1;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool);
    const result = await seedDemo({ db, fixturePath });
    process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    return 1;
  } finally {
    await pool.end();
  }
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("seed-demo.ts");
if (invokedDirectly) {
  seedDemoCli(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
