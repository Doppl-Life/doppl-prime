import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  createEventStore,
  replayEvents,
  runMigrations,
  type EventStore,
  type RunEventRow,
} from '../../../src/event-store';
import {
  buildCurrentState,
  buildLineageGraph,
  buildReplaySummary,
  canonicalize,
} from '../../../src/projections';
import { isRunTerminal } from '../../../src/runtime/worker/activeRunGuard';
import type { ModelGateway } from '../../../src/model-gateway';
import { bootApp } from '../../../src/main';
import { captureDemoFixture, DEMO_FIXTURE_RUN_ID } from '../_support/recorded-demo-gateway';

/**
 * PD.8a — the CREDS-FREE end-to-end demo proof (ARCHITECTURE.md §16/§17/§4, KEY SAFETY RULE #7). Real PG
 * (testcontainers) + a RECORDED gateway + NO real provider keys (placeholder values keep §15 fail-fast
 * intact; the recorded/replay path never uses them). It boots the REAL stack (`bootApp`: migrate → seed the
 * committed fixture → start) and asserts the seeded run reconstructs to a run-terminal + the final-idea
 * projection resolves (a `status:'selected'` winner — now derivable via the PD.11 bridge) + the boot/seed/
 * replay path calls NO provider + replay state-equivalence. The committed fixture (`fixtures/replay/<runId>
 * .json`) is captured ONCE via the loop-capable recorded fake (the gated `capture_demo_fixture` test);
 * normal CI reads it. The web RENDER is covered by P7.15 `dashboard-smoke.spec.ts` (cited, not duplicated).
 */

const FIXTURE_DIR = fileURLToPath(new URL('../../../../../fixtures/replay', import.meta.url));
const FIXTURE_PATH = `${FIXTURE_DIR}/${DEMO_FIXTURE_RUN_ID}.json`;

// ---- isolated-database harness (mirrors main-boot.test.ts) --------------------------------------
let adminPool: pg.Pool;
let baseUri: string;
let dbCounter = 0;
const createdDbs: string[] = [];
const openPools: pg.Pool[] = [];

beforeAll(() => {
  baseUri = inject('pgConnectionUri');
  adminPool = new pg.Pool({ connectionString: baseUri });
});

afterAll(async () => {
  while (openPools.length > 0) await openPools.pop()!.end();
  for (const name of createdDbs) {
    await adminPool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
  await adminPool.end();
});

async function freshDatabaseUrl(): Promise<string> {
  const name = `doppl_smoke_${dbCounter++}`;
  await adminPool.query(`CREATE DATABASE "${name}"`);
  createdDbs.push(name);
  const uri = new URL(baseUri);
  uri.pathname = `/${name}`;
  return uri.toString();
}

function probeStore(databaseUrl: string): EventStore {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  openPools.push(pool);
  return createEventStore({ db: drizzle(pool), secretValues: [] });
}

/** Boot env: placeholder creds (keep §15 fail-fast intact) + the seed-fixture directive (recorded mode). */
function smokeEnv(databaseUrl: string): Record<string, string | undefined> {
  return {
    OPENROUTER_API_KEY: 'or-placeholder-not-used',
    OPENAI_API_KEY: 'oai-placeholder-not-used',
    DATABASE_URL: databaseUrl,
    DOPPL_SEED_FIXTURE: DEMO_FIXTURE_RUN_ID,
  };
}

/** A gateway that COUNTS calls and throws if ever touched — proves seed/replay calls no provider (rule #7). */
function countingGateway(): { gateway: ModelGateway; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    gateway: {
      capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
      call: () => {
        calls += 1;
        throw new Error(
          'provider called on the boot/seed/replay path (must be creds-free, rule #7)',
        );
      },
    },
  };
}

/** Load + deserialize the committed fixture's events (occurredAt ISO → Date) for direct re-folding. */
function committedFixtureRows(): RunEventRow[] {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as {
    events: ({ occurredAt: string } & Omit<RunEventRow, 'occurredAt'>)[];
  };
  return raw.events.map((e) => ({ ...e, occurredAt: new Date(e.occurredAt) }));
}

// ---- one-time capture (gated; run with DOPPL_CAPTURE_FIXTURE=1 to (re)generate the committed artifact) --
describe('capture the committed demo fixture (one-time; gated)', () => {
  test.runIf(process.env.DOPPL_CAPTURE_FIXTURE === '1')(
    'capture_demo_fixture',
    async () => {
      const url = await freshDatabaseUrl();
      await runMigrations(url);
      const pool = new pg.Pool({ connectionString: url });
      openPools.push(pool);
      const { path, fixture } = await captureDemoFixture({
        db: drizzle(pool) as NodePgDatabase,
        databaseUrl: url,
        dir: FIXTURE_DIR,
      });
      // sanity: the artifact is a terminal run with a selected winner before it is committed.
      expect(isRunTerminal(fixture.events)).toBe(true);
      const graph = buildLineageGraph(buildCurrentState(fixture.events));
      expect(graph.nodes.some((n) => n.type === 'candidate' && n.status === 'selected')).toBe(true);
      console.log(`capture_demo_fixture: wrote ${path}`);
    },
    120_000,
  );
});

// ---- the creds-free e2e smoke (reads the committed fixture) -------------------------------------
describe('creds-free e2e demo smoke — boot → seed → replay (real PG, recorded gateway)', () => {
  let seededRows: RunEventRow[];
  let providerCalls: () => number;
  let booted: { close: () => Promise<void> } | undefined;

  beforeAll(async () => {
    // The committed fixture is the precondition for the smoke (captured once via the gated test above).
    if (!existsSync(FIXTURE_PATH)) {
      throw new Error(
        `demo fixture missing at ${FIXTURE_PATH} — run \`DOPPL_CAPTURE_FIXTURE=1 pnpm -C apps/api test:smoke:demo\` once to capture it`,
      );
    }
    const url = await freshDatabaseUrl();
    const { gateway, calls } = countingGateway();
    providerCalls = calls;
    booted = await bootApp({
      env: smokeEnv(url),
      fixtureDir: FIXTURE_DIR,
      gateway,
      port: 0,
      host: '127.0.0.1',
    });
    seededRows = await probeStore(url).readByRun(DEMO_FIXTURE_RUN_ID);
  });

  afterAll(async () => {
    await booted?.close();
  });

  // spec(§16/§17) — the demo-of-record: migrate → seedDemo(committed fixture) → start reconstructs the run
  // to a run-terminal via the replay reader. Creds-free (placeholder keys; recorded gateway).
  test('boot_seed_replay_reaches_terminal', () => {
    expect(seededRows.length).toBeGreaterThan(0);
    expect(isRunTerminal(seededRows)).toBe(true);
  });

  // spec(§12/§17) — the proof surface has a winner: the seeded run's lineage projection carries a
  // status:'selected' candidate node AND that candidate is materialized (the §12 panel's data) — derivable
  // only because the PD.11 bridge marks the run.completed.finalIdeaRef candidate selected.
  test('final_idea_projection_resolves', () => {
    const { state } = buildCurrentState(seededRows);
    const graph = buildLineageGraph({ runId: DEMO_FIXTURE_RUN_ID, sequenceThrough: 0, state });
    const winnerNode = graph.nodes.find((n) => n.type === 'candidate' && n.status === 'selected');
    expect(winnerNode).toBeDefined();
    expect(state.candidateIdeas[winnerNode!.id]?.status).toBe('selected');
    expect(buildReplaySummary(seededRows).digest.selectedCandidateId).toBe(winnerNode!.id);
  });

  // rule #7 — the boot/seed/replay path performs NO model/embedding/web call (the seeded run is terminal →
  // no worker runs → the injected gateway is never touched). Structural complement: the replay modules
  // import no provider seam (pinned by replay-summary.test.ts test_replay_imports_no_provider).
  test('replay_calls_no_provider', () => {
    expect(providerCalls()).toBe(0);
  });

  // spec(§4) — replay state-equivalence on the REAL fixture: the replayed projection equals the live fold
  // over the canonical serialization (re-folding the persisted log reconstructs the same state).
  test('replay_state_equivalence', () => {
    expect(canonicalize(buildReplaySummary(seededRows).state)).toBe(
      canonicalize(buildCurrentState(seededRows).state),
    );
  });

  // PD.1 — the committed fixture is a well-formed, dump-eligible artifact: it loads through replayEvents
  // (no ReplayIntegrityError), is run-terminal, and has a selected winner (a defensible demo-of-record).
  test('captured_fixture_is_terminal_and_validatable', () => {
    const rows = committedFixtureRows();
    expect(() => replayEvents(rows)).not.toThrow();
    expect(isRunTerminal(rows)).toBe(true);
    const graph = buildLineageGraph(buildCurrentState(rows));
    expect(graph.nodes.some((n) => n.type === 'candidate' && n.status === 'selected')).toBe(true);
  });
});
