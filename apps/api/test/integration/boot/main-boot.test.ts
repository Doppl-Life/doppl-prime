import { afterAll, afterEach, beforeAll, describe, expect, inject, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import {
  createEventStore,
  runMigrations,
  type AppendInput,
  type EventStore,
} from '../../../src/event-store';
import {
  type ModelGateway,
  type OpenRouterClient,
  type OpenRouterCompletionParams,
  type OpenRouterRawCompletion,
} from '../../../src/model-gateway';
import { dumpReplayToFile } from '../../../src/event-store/scripts/dump-replay';
import { bootApp } from '../../../src/main';
import { CANDIDATE_CONTENT, recordedDemoGateway } from '../_support/recorded-demo-gateway';

/**
 * PD.3 boot-spine — the production boot root `apps/api/src/main.ts` (ARCHITECTURE.md §15/§5/§11/§17,
 * KEY SAFETY RULES #2/#4/#7). Real-PG integration (testcontainers). `bootApp(overrides)` composes the
 * shipped seams: loadConfig (fail-fast env) → runMigrations → infra → AWAIT crashForward (before listen)
 * → buildServer({ onRunConfigured: createStartRun(infra) }) → app.listen.
 *
 * The boot wires the REAL `projections/run-list.listRunIds(db)` into BOTH crashForward + the worker, so
 * it scans the WHOLE connected DB. The shared testcontainer carries other tests' runs, so each test boots
 * against its OWN freshly-created database (full isolation — the real whole-DB reader is honored, not a
 * scoped stub). The run-executing tests inject a deterministic multi-role fake gateway (no live SDK call,
 * rule #7) — `selectGateway`'s `createFakeGateway` fixtures satisfy the per-role discipline but do not
 * shape a CandidateIdea, so they cannot drive the generation loop (the boot's default selection path is
 * covered by `boot_runs_migrations_idempotently`, which boots with no gateway override).
 */

// ---- isolated-database harness ----------------------------------------------------------------
let adminPool: pg.Pool;
let baseUri: string;
let tmpFixtureDir: string;
let dbCounter = 0;
const createdDbs: string[] = [];
const openPools: pg.Pool[] = [];

beforeAll(() => {
  baseUri = inject('pgConnectionUri');
  adminPool = new pg.Pool({ connectionString: baseUri });
  tmpFixtureDir = mkdtempSync(join(tmpdir(), 'doppl-boot-fix-'));
});

afterEach(async () => {
  // Close every per-test read pool so the dedicated DBs can be dropped without lingering connections.
  while (openPools.length > 0) {
    await openPools.pop()!.end();
  }
});

afterAll(async () => {
  for (const name of createdDbs) {
    await adminPool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
  await adminPool.end();
  rmSync(tmpFixtureDir, { recursive: true, force: true });
});

/** Create a fresh dedicated database and return its connection URI (counter-named — no injection risk). */
async function freshDatabaseUrl(): Promise<string> {
  const name = `doppl_boot_${dbCounter++}`;
  await adminPool.query(`CREATE DATABASE "${name}"`);
  createdDbs.push(name);
  const uri = new URL(baseUri);
  uri.pathname = `/${name}`;
  return uri.toString();
}

/** A read store on a dedicated DB — tracked so its pool is torn down in afterEach. */
function probeStore(databaseUrl: string): EventStore {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  openPools.push(pool);
  const db: NodePgDatabase = drizzle(pool);
  return createEventStore({ db, secretValues: [] });
}

const SECRET_OPENROUTER = 'or-secret-DO-NOT-ECHO';
const SECRET_OPENAI = 'oai-secret-DO-NOT-ECHO';

/** Valid boot env: required creds present + caps lowered (1 generation, pop 2) for a fast run. */
function bootEnv(
  databaseUrl: string | undefined,
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    OPENROUTER_API_KEY: SECRET_OPENROUTER,
    OPENAI_API_KEY: SECRET_OPENAI,
    DATABASE_URL: databaseUrl,
    DOPPL_MAX_GENERATIONS: '1',
    DOPPL_MAX_POPULATION: '2',
    ...extra,
  };
}

// ---- deterministic multi-role fake gateway (no live SDK — rule #7) ------------------------------
// The loop-capable recorded fake (`recordedDemoGateway` + `CANDIDATE_CONTENT`) lives in the shared support
// util `../_support/recorded-demo-gateway` (LESSON §5 single-source) — also used by the PD.8a capture/smoke.

/** A gateway whose FIRST provider call blocks until `open()` — keeps the first run non-terminal. */
function gatedGateway(): { gateway: ModelGateway; open: () => void } {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const inner = recordedDemoGateway();
  let gated = false;
  return {
    open,
    gateway: {
      capabilityFor: (role) => inner.capabilityFor(role),
      call: async (request) => {
        if (!gated) {
          gated = true;
          await gate;
        }
        return inner.call(request);
      },
    },
  };
}

function settledLatch(): { onSettled: () => void; settled: Promise<void> } {
  let resolve!: () => void;
  const settled = new Promise<void>((r) => {
    resolve = r;
  });
  return { onSettled: () => resolve(), settled };
}

const evt = (
  runId: string,
  type: AppendInput['type'],
  payload: Record<string, unknown> = {},
): AppendInput => ({
  id: `${runId}-${type}`,
  runId,
  type,
  actor: 'runtime',
  payload,
  schemaVersion: CURRENT_SCHEMA_VERSION,
});

function addressPort(server: { address: () => string | AddressInfo | null }): number {
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('server not listening on a port');
  return addr.port;
}

async function postRun(
  port: number,
  body: unknown = {},
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const TERMINAL_EVENTS = ['run.completed', 'run.failed', 'run.stopped', 'run.cancelled'];

describe('bootApp — PD.3 production boot root (real PG, testcontainers)', () => {
  // spec(§15) — fail-fast on a missing required env var; names the var, never echoes a value (rule #4 / LESSON 26).
  test('boot_fails_fast_on_missing_database_url', async () => {
    const env = bootEnv(undefined); // DATABASE_URL absent
    let caught: Error | undefined;
    await bootApp({ env, port: 0, host: '127.0.0.1' }).catch((err: unknown) => {
      caught = err as Error;
    });
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/DATABASE_URL/);
    // no value echo: a present secret must never leak into an unrelated boot error, and no DB URL value.
    expect(caught!.message).not.toContain(SECRET_OPENROUTER);
    expect(caught!.message).not.toContain('postgres://');
  });

  // spec(§15) — fail-fast on a missing provider key; the error names the var (assertProviderCredentials).
  test('boot_fails_fast_on_missing_provider_key', async () => {
    const env = bootEnv('postgres://u:p@localhost:5432/none');
    delete env.OPENROUTER_API_KEY;
    let caught: Error | undefined;
    await bootApp({ env, port: 0, host: '127.0.0.1' }).catch((err: unknown) => {
      caught = err as Error;
    });
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/OPENROUTER_API_KEY/);
  });

  // spec(§15) — fail-fast on a malformed listen PORT (names the var) BEFORE any migration/IO — a boot-config
  // root fails fast on a bad port like every other env, never silently binding NaN→an unintended port.
  test('boot_fails_fast_on_invalid_port', async () => {
    const env = bootEnv('postgres://u:p@localhost:5432/none', { PORT: 'not-a-port' });
    let caught: Error | undefined;
    await bootApp({ env, host: '127.0.0.1' }).catch((err: unknown) => {
      caught = err as Error;
    });
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/PORT/);
  });

  // spec(§9/§17) — migrate is the first boot step + idempotent: first boot creates run_events; second is a no-op.
  // No gateway override → boot uses the REAL env-switched selectGateway (recorded default) — the production wiring.
  test('boot_runs_migrations_idempotently', async () => {
    const url = await freshDatabaseUrl();
    const first = await bootApp({ env: bootEnv(url), port: 0, host: '127.0.0.1' });
    // run_events exists → an append through the schema succeeds.
    const store = probeStore(url);
    await store.append(evt('mig-probe', 'run.configured'));
    expect(await store.readByRun('mig-probe')).toHaveLength(1);
    await first.close();
    // second boot against the same DB is a clean no-op (does not throw).
    const second = await bootApp({ env: bootEnv(url), port: 0, host: '127.0.0.1' });
    await second.close();
  });

  // spec(§5) — crash-forward runs BEFORE listen: an orphaned non-terminal run is forward-failed by boot,
  // and the next POST is then accepted (P3.13 clean-slate — the single-active-run guard starts clean).
  test('crash_forward_runs_before_listen', async () => {
    const url = await freshDatabaseUrl();
    await runMigrations(url); // seed BEFORE boot needs the table.
    const seed = probeStore(url);
    await seed.append(evt('orphan', 'run.configured'));
    await seed.append(evt('orphan', 'run.started', { from: 'configured', to: 'running' }));

    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway: recordedDemoGateway(),
      onSettled,
    });
    // boot's crashForward (awaited before listen) forward-failed the orphan.
    const orphanLog = await seed.readByRun('orphan');
    expect(orphanLog.some((r) => r.type === 'run.failed')).toBe(true);
    // the guard is clean → a subsequent POST is accepted.
    const { status } = await postRun(addressPort(app.server));
    expect(status).toBe(201);
    await settled; // let the triggered worker settle before teardown.
    await close();
  });

  // spec(§11) — POST /runs over the LISTENING server appends run.configured + fires the worker (createStartRun);
  // the run executes in-process and reaches a terminal status (REST is the sole write path, rule #2).
  test('post_runs_fires_worker_to_terminal', async () => {
    const url = await freshDatabaseUrl();
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway: recordedDemoGateway(),
      onSettled,
    });
    const port = addressPort(app.server);
    const { status, json } = await postRun(port);
    expect(status).toBe(201);
    const { runId } = json as { runId: string };
    // cap pin (rule #1 / §11): the route maxima == the boot ceiling (defaultConfig.caps = config.caps),
    // so a POST with a cap ABOVE the ceiling is rejected 422 (never clamped up) — recorded==executed can't
    // drift via a runConfig.caps/config.caps divergence. Cap-override (422) is checked before any append.
    const over = await postRun(port, { caps: { maxPopulation: 1_000_000 } });
    expect(over.status).toBe(422);
    expect((over.json as { error?: string }).error).toBe('cap_override_exceeds_max');
    await settled;
    const rows = await probeStore(url).readByRun(runId);
    expect(rows.some((r) => r.type === 'run.started')).toBe(true);
    expect(rows.some((r) => TERMINAL_EVENTS.includes(r.type))).toBe(true);
    await close();
  });

  // spec(§15) — single-active-run serialization end-to-end: a 2nd POST while one run is non-terminal → 409
  // (the in-route activeRunId re-validated vs the log, LESSON 56). Boot adds no second concurrent path.
  test('second_post_runs_rejected_while_active', async () => {
    const url = await freshDatabaseUrl();
    const { gateway, open } = gatedGateway(); // run 1 blocks at its first gateway call → stays non-terminal.
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway,
      onSettled,
    });
    const port = addressPort(app.server);
    const r1 = await postRun(port);
    expect(r1.status).toBe(201);
    const r2 = await postRun(port);
    expect(r2.status).toBe(409);
    expect((r2.json as { error?: string }).error).toBe('run_already_active');
    open(); // release run 1 so it terminalizes cleanly.
    await settled;
    await close();
  });

  // spec(§17) — local-first boot completes the full path on the RECORDED gateway with ZERO live calls
  // (the injected fake has no SDK; the spy proves the recorded gateway drove the loop, rule #7).
  test('boot_completes_with_recorded_gateway_no_live_calls', async () => {
    const url = await freshDatabaseUrl();
    let calls = 0;
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway: recordedDemoGateway({ onCall: () => (calls += 1) }),
      onSettled,
    });
    const { status, json } = await postRun(addressPort(app.server));
    expect(status).toBe(201);
    const { runId } = json as { runId: string };
    await settled;
    expect(calls).toBeGreaterThan(0); // the full path ran ON the recorded gateway — zero live by construction.
    const rows = await probeStore(url).readByRun(runId);
    expect(rows.some((r) => TERMINAL_EVENTS.includes(r.type))).toBe(true);
    await close();
  });

  // Resource lifecycle — close() ends the pg pool + stops the server (no open-handle leak across tests).
  test('bootApp_close_tears_down', async () => {
    const url = await freshDatabaseUrl();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway: recordedDemoGateway(),
    });
    expect(app.server.listening).toBe(true);
    await close();
    expect(app.server.listening).toBe(false);
  });
});

describe('bootApp seed step — PD.3-completion migrate→seed→start (real PG)', () => {
  /** Generate a committed fixture by dumping a real terminal run (PD.1) into the tmp fixture dir. */
  async function generateSeedFixture(runId: string): Promise<void> {
    const sourceUrl = await freshDatabaseUrl();
    await runMigrations(sourceUrl);
    const source = probeStore(sourceUrl);
    await source.append(evt(runId, 'run.configured', { rngSeed: 4 }));
    await source.append(evt(runId, 'run.started', { from: 'configured', to: 'running' }));
    await source.append(
      evt(runId, 'run.completed', { from: 'running', to: 'completed', finalIdeaRef: 'cand-seed' }),
    );
    await dumpReplayToFile({ store: source, runId, dir: tmpFixtureDir });
  }

  // spec(§17) — migrate → SEED → start: DOPPL_SEED_FIXTURE loads the committed fixture into the boot DB.
  test('boot_with_seed_fixture_loads_replayable_run', async () => {
    const runId = `seed-boot-${dbCounter}`;
    await generateSeedFixture(runId);
    const url = await freshDatabaseUrl();
    const { app, close } = await bootApp({
      env: bootEnv(url, { DOPPL_SEED_FIXTURE: runId }),
      fixtureDir: tmpFixtureDir,
      port: 0,
      host: '127.0.0.1',
    });
    const rows = await probeStore(url).readByRun(runId);
    expect(rows.map((r) => r.sequence)).toEqual([0, 1, 2]); // identical-by-sequence
    expect(rows.some((r) => r.type === 'run.completed')).toBe(true); // the terminal run replays
    expect(app.server.listening).toBe(true);
    await close();
  });

  // spec(§17) — a configured-but-missing fixture ABORTS boot before listen (no half-seeded demo served).
  test('boot_missing_seed_fixture_aborts_before_listen', async () => {
    const url = await freshDatabaseUrl();
    let caught: Error | undefined;
    await bootApp({
      env: bootEnv(url, { DOPPL_SEED_FIXTURE: 'no-such-fixture-run' }),
      fixtureDir: tmpFixtureDir,
      port: 0,
      host: '127.0.0.1',
    }).catch((err: unknown) => {
      caught = err as Error;
    });
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/ENOENT|no such file|fixture/i);
  });

  // spec(additive env-gate) — no DOPPL_SEED_FIXTURE → the seed step is a no-op (the live boot is unchanged).
  test('boot_no_seed_fixture_skips_seed', async () => {
    const url = await freshDatabaseUrl();
    const { app, close } = await bootApp({
      env: bootEnv(url), // no DOPPL_SEED_FIXTURE
      fixtureDir: tmpFixtureDir,
      port: 0,
      host: '127.0.0.1',
    });
    expect(app.server.listening).toBe(true); // boot succeeds; nothing seeded
    await close();
  });

  // spec(§5) — the seed runs BEFORE crashForward: the seeded TERMINAL run is left untouched (no crash terminal).
  test('boot_seed_runs_before_crash_forward', async () => {
    const runId = `seed-cf-${dbCounter}`;
    await generateSeedFixture(runId);
    const url = await freshDatabaseUrl();
    const { close } = await bootApp({
      env: bootEnv(url, { DOPPL_SEED_FIXTURE: runId }),
      fixtureDir: tmpFixtureDir,
      port: 0,
      host: '127.0.0.1',
    });
    const rows = await probeStore(url).readByRun(runId);
    expect(rows).toHaveLength(3); // exactly the seeded events — crashForward added no terminal
    expect(rows.filter((r) => r.type === 'run.failed' || r.type === 'run.cancelled')).toHaveLength(
      0,
    );
    await close();
  });
});

// ---- PD.9: DOPPL_GATEWAY=live boot branch (injected fake client — no network, no real SDK) ----------
/**
 * A fake `OpenRouterClient` that returns role-appropriate structured outputs so a run can drive the LIVE
 * gateway to a terminal without a network call. Role is read from the structured `responseFormat.name`
 * (`<role>_output`), falling back to the route's modelId for the unstructured embedding call.
 */
function fakeOpenRouterClient(opts: { onCall?: () => void } = {}): OpenRouterClient {
  return {
    complete(params: OpenRouterCompletionParams): Promise<OpenRouterRawCompletion> {
      opts.onCall?.();
      // Role detection from the contract-shaped params (the client never sees ModelRole): structured calls
      // (critic/final_judge/fusion_synthesis) carry responseFormat.name `<role>_output`; embedding is the
      // only EMBEDDING_ONLY route (no responseFormat) → keyed by its modelId; the population_generator call
      // is the loop's only SCHEMA-LESS non-embedding call → the remaining fallback.
      const role = params.responseFormat
        ? params.responseFormat.name.replace(/_output$/, '')
        : params.model === 'text-embedding-3-small'
          ? 'embedding'
          : 'population_generator';
      let output: unknown;
      if (role === 'embedding') {
        output = { vector: [0.1, 0.2, 0.3], embeddingModelId: 'fake-embed', dimension: 3 };
      } else if (role === 'final_judge') {
        output = {
          grounding: 4,
          novelty: 3,
          feasibility: 5,
          falsification_survival: 2,
          subtype_check_pass: 4,
        };
      } else if (role === 'fusion_synthesis') {
        output = { synthesis: 'a merged child system prompt' };
      } else if (role === 'population_generator') {
        output = CANDIDATE_CONTENT;
      } else {
        output = { critique: 'stub critique', confidence: 0.5, scores: { grounding: 4 } };
      }
      return Promise.resolve({
        id: 'fake-or-req',
        model: params.model,
        output,
        tokensIn: 1,
        tokensOut: 1,
      });
    },
  };
}

describe('bootApp — PD.9 DOPPL_GATEWAY=live (real PG, injected fake client)', () => {
  // spec(§6/§17) — DOPPL_GATEWAY=live builds the live gateway at boot (createLiveGateway over the injected
  // client) and threads it into the worker: a POSTed run drives the fake client (no network), reaching a terminal.
  test('boot_live_mode_builds_live_gateway', async () => {
    const url = await freshDatabaseUrl();
    let clientCalls = 0;
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url, { DOPPL_GATEWAY: 'live' }),
      port: 0,
      host: '127.0.0.1',
      openRouterClient: fakeOpenRouterClient({ onCall: () => (clientCalls += 1) }),
      onSettled,
    });
    const { status, json } = await postRun(addressPort(app.server));
    expect(status).toBe(201);
    const { runId } = json as { runId: string };
    await settled;
    expect(clientCalls).toBeGreaterThan(0); // the env→live branch routed the run through the injected client
    const rows = await probeStore(url).readByRun(runId);
    expect(rows.some((r) => TERMINAL_EVENTS.includes(r.type))).toBe(true);
    await close();
  });

  // spec(§17, Q4 lazy) — recorded default builds NO provider client: an injected client that THROWS if
  // touched is ignored, and a recorded boot still succeeds (the recorded branch returns before any
  // registry/client construction — local-first stays provider-client-free).
  test('boot_recorded_mode_does_not_use_provider_client', async () => {
    const url = await freshDatabaseUrl();
    const throwingClient: OpenRouterClient = {
      complete() {
        throw new Error('recorded boot must not build/use a provider client');
      },
    };
    const { app, close } = await bootApp({
      env: bootEnv(url), // DOPPL_GATEWAY unset → recorded; resolveGateway takes the recorded branch
      port: 0,
      host: '127.0.0.1',
      openRouterClient: throwingClient, // ignored in recorded mode — never constructed-into-use
    });
    expect(app.server.listening).toBe(true); // boot succeeded without touching the provider client
    await close();
  });
});
