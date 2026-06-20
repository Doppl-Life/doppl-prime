import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CONTRACTS_SCHEMA_VERSION, type RunEventEnvelope } from "@doppl/contracts";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { replayReader } from "../replay-reader.js";

/**
 * Prepared-replay capture (PD.1). Exports a completed run's events to
 * `fixtures/replay/<runId>.json` strictly ordered by (runId, sequence).
 * The artifact carries the run's schemaVersion so seed-demo can
 * fail fast on a forward-version load (re-record, not upcast).
 *
 * Pure DB read: no model, no web, no embedding calls. Redaction
 * already ran at append time (Phase 1) so no provider key reaches
 * the JSON.
 *
 * Refuses to dump a non-terminal run — only completed / stopped /
 * failed / cancelled runs are dump-eligible.
 */

export class DumpRefusedError extends Error {
  constructor(reason: string) {
    super(`dump-replay refused: ${reason}`);
    this.name = "DumpRefusedError";
  }
}

const TERMINAL_STATUSES = new Set(["completed", "stopped", "failed", "cancelled"]);
const TERMINAL_EVENT_TYPES = new Set(["run.completed", "run.stopped", "run.failed"]);

export interface DumpReplayInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
  outDir?: string;
}

export interface DumpReplayResult {
  path: string;
  runId: string;
  schemaVersion: number;
  eventsExported: number;
}

export interface ReplayArtifact {
  runId: string;
  schemaVersion: number;
  exportedAt: string;
  events: RunEventEnvelope[];
}

export const DEFAULT_FIXTURE_DIR = resolve(process.cwd(), "fixtures/replay");

async function readRunStatus(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
): Promise<{ id: string; status: string } | null> {
  const result = await db.execute<{ id: string; status: string }>(
    sql`SELECT id, status FROM runs WHERE id = ${runId} LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

export async function dumpReplay(input: DumpReplayInput): Promise<DumpReplayResult> {
  const outDir = input.outDir ?? DEFAULT_FIXTURE_DIR;

  const runRow = await readRunStatus(input.db, input.runId);
  if (!runRow) {
    throw new DumpRefusedError(`run ${input.runId} not found`);
  }
  if (!TERMINAL_STATUSES.has(runRow.status)) {
    throw new DumpRefusedError(
      `run ${input.runId} is at status '${runRow.status}' — only completed/stopped/failed/cancelled runs are dump-eligible`,
    );
  }

  const events: RunEventEnvelope[] = [];
  let schemaVersion = CONTRACTS_SCHEMA_VERSION;
  for await (const envelope of replayReader(input.db).events(input.runId)) {
    events.push(envelope);
    schemaVersion = Math.max(schemaVersion, envelope.schemaVersion);
  }
  if (events.length === 0) {
    throw new DumpRefusedError(`run ${input.runId} has zero events`);
  }
  const tail = events[events.length - 1];
  if (!tail || !TERMINAL_EVENT_TYPES.has(tail.type)) {
    // Cancelled runs may not have a terminal event — accept those too.
    if (runRow.status !== "cancelled") {
      throw new DumpRefusedError(
        `run ${input.runId} has no terminal event (last event type: ${tail?.type ?? "none"})`,
      );
    }
  }

  const artifact: ReplayArtifact = {
    runId: input.runId,
    schemaVersion,
    exportedAt: new Date().toISOString(),
    events,
  };

  const path = join(outDir, `${input.runId}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(artifact, null, 2), "utf-8");

  return {
    path,
    runId: input.runId,
    schemaVersion,
    eventsExported: events.length,
  };
}

/**
 * CLI entry: `tsx dump-replay.ts <runId>`. The runner constructs its
 * own db handle from DATABASE_URL.
 */
export async function dumpReplayCli(argv: readonly string[]): Promise<number> {
  const runId = argv[0];
  if (!runId) {
    process.stderr.write("usage: dump-replay <runId> [outDir]\n");
    return 1;
  }
  const outDir = argv[1];
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
    const result = await dumpReplay({ db, runId, ...(outDir ? { outDir } : {}) });
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

// CLI entrypoint when invoked directly via tsx.
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("dump-replay.ts");
if (invokedDirectly) {
  dumpReplayCli(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
