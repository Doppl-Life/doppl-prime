import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createEventStore, replayEvents, type EventStore, type RunEventRow } from '../index';
import { isRunTerminal } from '../../runtime/worker/activeRunGuard';
import { assertSafeRunId } from './runId-guard';

/**
 * PD.1 — prepared-replay capture (ARCHITECTURE.md §16/§9/§4, KEY SAFETY RULES #4/#7). A read-only export
 * of a COMPLETED/terminal run's `run_events` to `fixtures/replay/<runId>.json`, the committed fixture the
 * PD.2 `seed-demo` loader replays (the safety-net fallback's source of truth).
 *
 * The dump goes THROUGH `replayEvents` (the P1.8 validator): it VALIDATES + orders by `sequence` (the sole
 * ordering key, never `occurredAt`) and THROWS `ReplayIntegrityError` on a gap/out-of-order/too-new log —
 * so a corrupt persisted log fails LOUD, never a silently-resorted fixture. `isRunTerminal` (the 4 real
 * run-terminal events) is the single dump-eligibility source. Replay-safety is STRUCTURAL: this module
 * imports NO provider / embedding / web seam (rule #7, lesson 30/55) and reads NO secret — the persisted
 * payloads were already scrubbed at append (rule #4), so the dumped JSON re-introduces none. The pure
 * `buildReplayFixture` core is split from the IO boundary (`dumpReplayToFile` + the guarded runner).
 */

export interface ReplayFixture {
  /** The pinned schemaVersion (max over the run's rows) — PD.2 gates `≤ current` at seed time (§16). */
  readonly schemaVersion: number;
  readonly runId: string;
  /** The validated, sequence-ordered stream — serialized verbatim (RNG seed / outcomes / vectors carried as-is). */
  readonly events: readonly RunEventRow[];
}

/**
 * Pure core — guard (non-empty + terminal) → validate/order through `replayEvents` (never re-sorts) → pin
 * `schemaVersion` (max over rows) → assemble. Throws on an empty/unknown run, a non-terminal run
 * (dump-ineligible), or a corrupt log (`ReplayIntegrityError` from `replayEvents`).
 */
export function buildReplayFixture(events: readonly RunEventRow[], runId: string): ReplayFixture {
  if (events.length === 0) {
    throw new Error(
      `dump-replay: run '${runId}' has no events — nothing to dump (unknown/empty run)`,
    );
  }
  if (!isRunTerminal(events)) {
    throw new Error(
      `dump-replay: run '${runId}' is not terminal — only a completed/terminal run is dump-eligible`,
    );
  }
  // Validate + order THROUGH replayEvents (throws ReplayIntegrityError on gap/out_of_order/schema_too_new);
  // never re-sorts → the written array is the gap-free, strictly-increasing-from-0 stream by construction.
  const ordered = replayEvents(events);
  const schemaVersion = Math.max(...ordered.map((row) => row.schemaVersion));
  return { schemaVersion, runId, events: ordered };
}

export interface DumpReplayDeps {
  readonly store: Pick<EventStore, 'readByRun'>;
  readonly runId: string;
  /** The committed fixtures directory (`fixtures/replay/`); the artifact is `<dir>/<runId>.json`. */
  readonly dir: string;
}

/** IO boundary — read the run's events, build the fixture, write `<dir>/<runId>.json`. Read-only (no append). */
export async function dumpReplayToFile(
  deps: DumpReplayDeps,
): Promise<{ path: string; fixture: ReplayFixture }> {
  assertSafeRunId(deps.runId); // reject a traversal id BEFORE any read/write (the artifact stays inside `dir`).
  const events = await deps.store.readByRun(deps.runId);
  const fixture = buildReplayFixture(events, deps.runId); // throws BEFORE any write on an ineligible/corrupt run.
  await mkdir(deps.dir, { recursive: true });
  const path = join(deps.dir, `${deps.runId}.json`);
  await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  return { path, fixture };
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
    console.error('usage: dump-replay <runId>');
    process.exit(1);
  }
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    console.error('Missing required env var: DATABASE_URL');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  // secretValues:[] — the dump only READS (the scrub runs at append, not read); no secret source here (rule #4).
  const store = createEventStore({ db: drizzle(pool), secretValues: [] });
  dumpReplayToFile({ store, runId, dir: DEFAULT_FIXTURE_DIR })
    .then(({ path }) => {
      console.log(`dump-replay: wrote ${path}`);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    })
    .finally(() => {
      void pool.end();
    });
}
