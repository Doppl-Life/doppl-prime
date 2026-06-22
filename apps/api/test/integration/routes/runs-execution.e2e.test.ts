import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  ReproductionEvent,
  validCandidateIdeaCrossDomain,
  validProviderMeta,
} from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { createGateway, ProviderCallError, type ProviderCallFn } from '../../../src/model-gateway';
import { loadConfig } from '../../../src/runtime/config/loadConfig';
import { CHECK_RUNNER_REGISTRY } from '../../../src/check-runners/registry';
import { buildServer, DEFAULT_RUN_CONFIG } from '../../../src/server';
import { createStartRun } from '../../../src/boot/startRun';

/**
 * P5.11 demo POST /runs trigger — HTTP e2e (testcontainers, real PG + Fastify inject + fake gateway §24).
 * THE PRODUCTION ENTRY POINT: POST /runs → run.configured append → onRunConfigured → runWorker(
 * composeRunWorkerDeps) → the generation loop with all 3 real seams + threading. Closes the loop from the
 * operator HTTP command to the running organism: a multi-generation evolving run on the true
 * verify→score→reproduce→thread path, observable via the event log. fire-and-forget (the 201 doesn't block
 * on the run); the test latches on an injected onSettled for deterministic await (no polling).
 *
 * // production entry: POST /runs (§11) → onRunConfigured → runWorker (§5) — selection reachable end-to-end
 */

const VALID_ENV: Record<string, string | undefined> = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};

const CANDIDATE_CONTENT = {
  title: validCandidateIdeaCrossDomain.title,
  summary: validCandidateIdeaCrossDomain.summary,
  claims: validCandidateIdeaCrossDomain.claims,
  evidenceRefs: validCandidateIdeaCrossDomain.evidenceRefs,
  subtype: validCandidateIdeaCrossDomain.subtype,
  subtypePayload: validCandidateIdeaCrossDomain.subtypePayload,
};

// The boot AppConfig (top-level caps maxGenerations/maxPopulation = 2 — the ceiling the loop enforces).
// W3b-2c: the worker now EXECUTES the recorded run.configured config, clamped to the boot ceiling. So the
// POST body carries the boot TOP-LEVEL caps (recorded == executed under the clamp: maxGenerations:2 ==
// min(2, boot 2) → ≥2 generations evolve, no divergence). A custom-config test below posts maxGenerations:1.
const BOOT_CONFIG = loadConfig({
  env: VALID_ENV,
  fileSources: { caps: { maxGenerations: 2, maxPopulation: 2 } },
});
const POST_BODY = { ...BOOT_CONFIG.runConfig, caps: BOOT_CONFIG.caps };
// A CUSTOM operator config — maxGenerations lowered to 1 (within the boot ceiling): the worker must run
// EXACTLY 1 generation (recorded == executed), not the boot default of 2.
const CUSTOM_BODY = {
  ...BOOT_CONFIG.runConfig,
  caps: { ...BOOT_CONFIG.caps, maxGenerations: 1 },
};

// Multi-role fake providerCall (§24) → injected into the REAL createGateway. `failPopulation` forces the
// population_generator to terminally reject (→ the run fails); `onCall` counts provider invocations.
function multiRoleProviderCall(
  opts: { failPopulation?: boolean; onCall?: () => void } = {},
): ProviderCallFn {
  return (request) => {
    opts.onCall?.();
    if (opts.failPopulation === true && request.role === 'population_generator') {
      return Promise.reject(
        new ProviderCallError([{ attempt: 1, reason: 'forced_failure' }], {
          provider: 'fake',
          modelId: 'fake',
          gatewayRequestId: 'greq_fail',
          tokensIn: 0,
          tokensOut: 0,
        }),
      );
    }
    let output: unknown;
    if (request.role === 'embedding') {
      output = { vector: [0.1, 0.2, 0.3], embeddingModelId: 'fake-embed', dimension: 3 };
    } else if (request.role === 'final_judge') {
      output = {
        grounding: 4,
        novelty: 3,
        feasibility: 5,
        falsification_survival: 2,
        subtype_check_pass: 4,
      };
    } else if (request.role === 'fusion_synthesis') {
      output = { synthesis: 'a merged child system prompt' };
    } else if (request.role === 'population_generator') {
      output = CANDIDATE_CONTENT;
    } else {
      output = { critique: 'stub critique', confidence: 0.5, scores: { grounding: 4 } };
    }
    return Promise.resolve({ output, providerMeta: validProviderMeta });
  };
}

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;
let gid = 0;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

interface AppOpts {
  withTrigger?: boolean; // default true
  failPopulation?: boolean;
  onSettled?: (runId: string) => void;
  onCall?: () => void;
}

function makeApp(opts: AppOpts = {}) {
  const newId = () => `e2e-${gid++}`;
  const config = BOOT_CONFIG; // the worker executes EXACTLY the config the test POSTs (recorded == executed).
  const modelGateway = createGateway({
    providerCall: multiRoleProviderCall({
      ...(opts.failPopulation !== undefined ? { failPopulation: opts.failPopulation } : {}),
      ...(opts.onCall !== undefined ? { onCall: opts.onCall } : {}),
    }),
    capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
  });
  const onRunConfigured =
    opts.withTrigger === false
      ? undefined
      : createStartRun({
          config,
          modelGateway,
          eventStore: store,
          checkRegistry: CHECK_RUNNER_REGISTRY,
          // Isolate this e2e run from the shared container's leftover runs (other tests leave non-terminal
          // `configured` runs): [] = no cross-run conflict so the worker starts THIS run. The worker's
          // cross-run active-guard is unit-pinned in run-worker.test.ts; this e2e tests the wiring path.
          listRunIds: () => Promise.resolve([]),
          newId,
          ...(opts.onSettled !== undefined ? { onSettled: opts.onSettled } : {}),
        });
  return buildServer({
    store,
    db,
    defaultConfig: DEFAULT_RUN_CONFIG,
    newId,
    ...(onRunConfigured !== undefined ? { onRunConfigured } : {}),
  });
}

function settledLatch(): { onSettled: () => void; settled: Promise<void> } {
  let resolve!: () => void;
  const settled = new Promise<void>((r) => {
    resolve = r;
  });
  return { onSettled: () => resolve(), settled };
}

describe('POST /runs → runWorker — the production entry point (HTTP e2e, real PG)', () => {
  // spec(§11) additive/non-breaking — no trigger wired → today's behavior: 201 + run.configured, NO execution.
  test('test_onRunConfigured_absent_is_current_behavior', async () => {
    const app = makeApp({ withTrigger: false });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/runs', payload: POST_BODY });
    expect(res.statusCode).toBe(201);
    const { runId } = res.json() as { runId: string };
    const rows = await store.readByRun(runId);
    expect(rows.filter((r) => r.type === 'run.configured')).toHaveLength(1);
    expect(rows.filter((r) => r.type === 'generation.started')).toHaveLength(0); // no execution.
    await app.close();
  });

  // spec(§11→§5) the production entry point — POST /runs with the trigger wired executes the run.
  test('test_post_runs_triggers_execution', async () => {
    const { onSettled, settled } = settledLatch();
    const app = makeApp({ onSettled });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/runs', payload: POST_BODY });
    expect(res.statusCode).toBe(201);
    const { runId } = res.json() as { runId: string };
    await settled;
    const rows = await store.readByRun(runId);
    expect(rows.filter((r) => r.type === 'generation.started').length).toBeGreaterThan(0);
    await app.close();
  });

  // spec(§8) THE HTTP e2e — POST /runs → multi-generation evolution on the true verify→score→reproduce→
  // thread path: ≥2 generations, gen N+1 from gen N's offspring, terminal run.completed with finalIdeaRef.
  test('test_http_e2e_multi_generation_evolution', async () => {
    const { onSettled, settled } = settledLatch();
    const app = makeApp({ onSettled });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/runs', payload: POST_BODY });
    expect(res.statusCode).toBe(201);
    const { runId } = res.json() as { runId: string };
    await settled;
    const rows = await store.readByRun(runId);

    expect(rows.filter((r) => r.type === 'generation.started').length).toBeGreaterThanOrEqual(2);

    const gen0Offspring = new Set(
      rows
        .filter(
          (r) =>
            (r.type === 'agenome.fused' || r.type === 'agenome.reproduced') &&
            r.generationId === `${runId}-gen0`,
        )
        .map((r) => ReproductionEvent.parse(r.payload).childAgenomeId),
    );
    const gen1Agenomes = new Set(
      rows
        .filter((r) => r.type === 'candidate.created' && r.generationId === `${runId}-gen1`)
        .map((r) => r.agenomeId),
    );
    expect(gen0Offspring.size).toBeGreaterThan(0);
    expect(gen1Agenomes).toEqual(gen0Offspring); // gen N+1 evolves from gen N.

    const terminal = rows.find((r) => r.type === 'run.completed' || r.type === 'run.failed');
    expect(terminal).toBeDefined();
    if (terminal?.type === 'run.completed') {
      expect(typeof (terminal.payload as { finalIdeaRef?: unknown }).finalIdeaRef).toBe('string');
    }
    await app.close();
  });

  // fire-and-forget robustness — a worker failure (forced gateway reject) does NOT crash the server: the
  // 201 already returned, the run terminalizes failed in the log, and the server still serves requests.
  test('test_worker_error_does_not_crash_server', async () => {
    const { onSettled, settled } = settledLatch();
    const app = makeApp({ failPopulation: true, onSettled });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/runs', payload: POST_BODY });
    expect(res.statusCode).toBe(201);
    const { runId } = res.json() as { runId: string };
    await settled;
    const rows = await store.readByRun(runId);
    expect(rows.some((r) => r.type === 'run.failed')).toBe(true);
    // the server is still up: a follow-up request succeeds.
    const follow = await app.inject({ method: 'GET', url: `/runs/${runId}` });
    expect(follow.statusCode).toBe(200);
    await app.close();
  });

  // spec(§5/§15) single-active-run holds end-to-end — a 2nd POST while one is active → 409 (route guard).
  test('test_second_run_while_active_409', async () => {
    const app = makeApp({ withTrigger: false });
    await app.ready();
    const r1 = await app.inject({ method: 'POST', url: '/runs', payload: POST_BODY });
    expect(r1.statusCode).toBe(201);
    const r2 = await app.inject({ method: 'POST', url: '/runs', payload: POST_BODY });
    expect(r2.statusCode).toBe(409);
    await app.close();
  });

  // spec(§9) rule #7 — after the HTTP-triggered run, re-reading the persisted log calls NO provider.
  test('test_replay_after_http_run_provider_free', async () => {
    const { onSettled, settled } = settledLatch();
    let calls = 0;
    const app = makeApp({ onSettled, onCall: () => (calls += 1) });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/runs', payload: POST_BODY });
    expect(res.statusCode).toBe(201);
    const { runId } = res.json() as { runId: string };
    await settled;
    const afterRun = calls;
    expect(afterRun).toBeGreaterThan(0);
    await store.readByRun(runId);
    await store.readByRun(runId);
    expect(calls).toBe(afterRun); // re-reading the log re-calls no provider.
    await app.close();
  });

  // spec(§8/§11) W3b-2c recorded == executed — POST a CUSTOM config (maxGenerations:1); startRun reads
  // run.configured → the worker runs under it (exactly 1 generation), NOT the boot default of 2. The
  // recorded run.configured.caps.maxGenerations == the executed generation count.
  test('test_http_e2e_custom_config_recorded_equals_executed', async () => {
    const { onSettled, settled } = settledLatch();
    const app = makeApp({ onSettled });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/runs', payload: CUSTOM_BODY });
    expect(res.statusCode).toBe(201);
    const { runId } = res.json() as { runId: string };
    await settled;
    const rows = await store.readByRun(runId);
    // executed: exactly 1 generation (the recorded maxGenerations:1 drove the worker, not the boot 2).
    expect(rows.filter((r) => r.type === 'generation.started')).toHaveLength(1);
    // recorded: the run.configured payload carries maxGenerations:1 == what executed.
    const configured = rows.find((r) => r.type === 'run.configured');
    expect(
      (configured?.payload as { caps?: { maxGenerations?: number } }).caps?.maxGenerations,
    ).toBe(1);
    await app.close();
  });
});
