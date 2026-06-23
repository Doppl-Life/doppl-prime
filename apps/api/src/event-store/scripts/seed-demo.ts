import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import { replayEvents, runEvents, type RunEventRow } from '../index';
import { assertSafeRunId } from './runId-guard';

/**
 * PD.2 — prepared-replay loader (ARCHITECTURE.md §17/§9/§4, KEY SAFETY RULES #2/#7). Loads a committed
 * `fixtures/replay/<runId>.json` (the PD.1 dump) into the demo `run_events` AFTER migrations, via a DIRECT
 * insert that preserves the recorded per-run `(sequence, occurredAt)` EXACTLY — the append path can't
 * restore (it re-allocates `sequence` under the advisory lock + stamps `occurredAt = now()`). The restore
 * is a BOUNDED, idempotent operation, NOT a rule-#2 violation: the append-only trigger blocks
 * UPDATE/DELETE/TRUNCATE but ALLOWS INSERT; `onConflictDoNothing` on the unique `(run_id, sequence)` makes
 * a re-seed a clean no-op; the fixture's `schemaVersion` is gated `≤ current` (fail-fast re-record if newer,
 * §17 — never upcast) and its ordering re-validated through `replayEvents` (a tampered committed fixture
 * fails loud BEFORE any insert); it loads only a path-guarded committed fixture + imports no provider seam
 * (rule #7 structural). Pure `buildSeedPlan` core is split from the IO boundary (`seedDemo` + guarded runner).
 */

/** The on-disk fixture row — `occurredAt` is the recorded ISO string (JSON.stringify of the Date column). */
export type SerializedRow = Omit<RunEventRow, 'occurredAt'> & { occurredAt: string };

export interface SerializedReplayFixture {
  readonly schemaVersion: number;
  readonly runId: string;
  readonly events: readonly SerializedRow[];
}

export interface SeedPlan {
  readonly runId: string;
  /** The restore rows — `occurredAt` deserialized to a `Date`, sequence-ordered + validated. */
  readonly rows: readonly RunEventRow[];
}

/**
 * Pure core — gate `schemaVersion ≤ current` (re-record error if newer, §17) → deserialize each row's
 * `occurredAt` ISO string → `Date` → re-validate ordering through `replayEvents` (throws
 * `ReplayIntegrityError` on a gap/out-of-order/too-new fixture). Returns the restore plan; appends nothing.
 */
export function buildSeedPlan(fixture: SerializedReplayFixture): SeedPlan {
  if (fixture.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `seed-demo: fixture schemaVersion ${fixture.schemaVersion} > current ${CURRENT_SCHEMA_VERSION} — re-record the fixture (MVP policy: re-record, not upcast)`,
    );
  }
  // Deserialize occurredAt at the boundary (ISO string → Date); a faithful restore of the recorded column.
  const rows: RunEventRow[] = fixture.events.map((event) => ({
    ...event,
    occurredAt: new Date(event.occurredAt),
  }));
  // Re-validate ordering BEFORE any insert — a hand-edited/tampered committed fixture fails loud.
  const ordered = replayEvents(rows);
  return { runId: fixture.runId, rows: [...ordered] };
}

export interface SeedDemoDeps {
  readonly db: NodePgDatabase;
  /** The committed fixtures directory (`fixtures/replay/`); reads `<dir>/<runId>.json`. */
  readonly dir: string;
  readonly runId: string;
}

export interface SeedResult {
  readonly runId: string;
  /** The number of rows in the fixture (the restore is idempotent — a re-seed inserts 0 new). */
  readonly rows: number;
}

/** Whether the authoritative `run_events` table exists (migrate-before-seed gate, §17). */
async function runEventsTableExists(db: NodePgDatabase): Promise<boolean> {
  const result = await db.execute(sql`SELECT to_regclass('run_events') AS reg`);
  const reg = (result.rows[0] as { reg: string | null } | undefined)?.reg ?? null;
  return reg !== null;
}

/**
 * IO boundary — path-guard the runId → read the committed fixture → assert migrations ran → buildSeedPlan →
 * direct restore-insert preserving recorded `(sequence, occurredAt)`, idempotent on the unique `(run_id,
 * sequence)`. Read-only of the fixture; the ONLY write is the bounded restore INSERT.
 */
export async function seedDemo(deps: SeedDemoDeps): Promise<SeedResult> {
  assertSafeRunId(deps.runId); // reject a traversal id BEFORE any read/insert (committed-fixtures-only).
  const raw = await readFile(join(deps.dir, `${deps.runId}.json`), 'utf8');
  const fixture = JSON.parse(raw) as SerializedReplayFixture;

  // Migrate-before-seed (§17): refuse against a DB whose authoritative table is absent (clear instruction).
  if (!(await runEventsTableExists(deps.db))) {
    throw new Error(
      'seed-demo: run_events table not found — run migrations first (migrate → seed → start)',
    );
  }

  const plan = buildSeedPlan(fixture); // throws on schema-too-new / corrupt order BEFORE any insert.
  await deps.db
    .insert(runEvents)
    .values([...plan.rows])
    .onConflictDoNothing({ target: [runEvents.runId, runEvents.sequence] });
  return { runId: plan.runId, rows: plan.rows.length };
}

/** The committed fixtures dir at the repo root (`fixtures/replay/`), resolved from this module's location. */
const DEFAULT_FIXTURE_DIR = fileURLToPath(
  new URL('../../../../../fixtures/replay', import.meta.url),
);

/** True when this module is the process entry (so an import never runs the CLI). ESM-safe. */
function isProcessEntry(): boolean {
  try {
    const entry = process.argv[1];
    return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isProcessEntry()) {
  const runId = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL;
  if (runId === undefined || runId.trim() === '') {
    console.error('usage: seed-demo <runId>');
    process.exit(1);
  }
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    console.error('Missing required env var: DATABASE_URL');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  seedDemo({ db, dir: DEFAULT_FIXTURE_DIR, runId })
    .then((result) => {
      console.log(`seed-demo: seeded run ${result.runId} (${result.rows} events)`);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    })
    .finally(() => {
      void pool.end();
    });
}
