import { afterAll, afterEach, beforeAll, describe, expect, inject, test } from 'vitest';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { validCandidateIdeaCrossDomain, validProviderMeta } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { createGateway, type ModelGateway, type ProviderCallFn } from '../../../src/model-gateway';
import { buildCurrentState } from '../../../src/projections';
import { isRunTerminal } from '../../../src/runtime/worker/activeRunGuard';
import { createOperatorStopRegistry } from '../../../src/boot/operatorStop';
import { bootApp } from '../../../src/main';
import { judgeFakeOutput } from '../_support/judge-output';

/**
 * PD.3 stop-path rewire — `POST /runs/:id/stop` SIGNALS the kernel operator-stop kill-and-drain
 * (ARCHITECTURE.md §5/§3/§11, KEY SAFETY RULE #2). The route latches an in-memory operator-stop registry
 * (`request`) + returns `202 stopRequested`; the in-flight worker polls the latch (`checker` → the loop's
 * `operatorStop` seam) at its next generation boundary, drains the current generation, and terminalizes
 * `run.stopped` (`running→stopping`, reason `operator_stop`, actor `runtime`) — the route appends NOTHING.
 *
 * The loop polls the kill at the top of each generation iteration AND in-loop between operations (BUG 2,
 * run 6b714273): a stop latched mid-generation halts the loop within one bounded step (before the next
 * agenome's generation / reproduction), draining the current generation. A gated gateway holds the worker
 * mid-gen-0; on release the in-loop poll fires → drain → `run.stopped`. Each test boots against its OWN
 * database (the real whole-DB `listRunIds`).
 */

// ---- isolated-database harness ----------------------------------------------------------------
let adminPool: pg.Pool;
let baseUri: string;
let dbCounter = 0;
const createdDbs: string[] = [];
const openPools: pg.Pool[] = [];

beforeAll(() => {
  baseUri = inject('pgConnectionUri');
  adminPool = new pg.Pool({ connectionString: baseUri });
});

afterEach(async () => {
  while (openPools.length > 0) {
    await openPools.pop()!.end();
  }
});

afterAll(async () => {
  for (const name of createdDbs) {
    await adminPool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
  await adminPool.end();
});

async function freshDatabaseUrl(): Promise<string> {
  const name = `doppl_stop_${dbCounter++}`;
  await adminPool.query(`CREATE DATABASE "${name}"`);
  createdDbs.push(name);
  const uri = new URL(baseUri);
  uri.pathname = `/${name}`;
  return uri.toString();
}

function probeStore(databaseUrl: string): EventStore {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  openPools.push(pool);
  const db: NodePgDatabase = drizzle(pool);
  return createEventStore({ db, secretValues: [] });
}

function bootEnv(
  databaseUrl: string,
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    OPENROUTER_API_KEY: 'or-key',
    OPENAI_API_KEY: 'oai-key',
    DATABASE_URL: databaseUrl,
    DOPPL_MAX_GENERATIONS: '2', // ≥2 so the gen-1 kill-check fires after gen-0 drains.
    DOPPL_MAX_POPULATION: '2',
    ...extra,
  };
}

// ---- deterministic multi-role fake gateway (no live SDK — rule #7) ------------------------------
const CANDIDATE_CONTENT = {
  title: validCandidateIdeaCrossDomain.title,
  summary: validCandidateIdeaCrossDomain.summary,
  claims: validCandidateIdeaCrossDomain.claims,
  evidenceRefs: validCandidateIdeaCrossDomain.evidenceRefs,
  subtype: validCandidateIdeaCrossDomain.subtype,
  subtypePayload: validCandidateIdeaCrossDomain.subtypePayload,
};

function multiRoleProviderCall(opts: { onCall?: () => void } = {}): ProviderCallFn {
  return (request) => {
    opts.onCall?.();
    let output: unknown;
    if (request.role === 'embedding') {
      output = { vector: [0.1, 0.2, 0.3], embeddingModelId: 'fake-embed', dimension: 3 };
    } else if (request.role === 'final_judge') {
      output = judgeFakeOutput(request, {
        grounding: 4,
        novelty: 3,
        feasibility: 5,
        falsification_survival: 2,
        subtype_check_pass: 4,
      });
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

function multiRoleGateway(opts: { onCall?: () => void } = {}): ModelGateway {
  return createGateway({
    providerCall: multiRoleProviderCall(opts),
    capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
  });
}

/**
 * A gateway whose FIRST provider call blocks until `open()` — holds the worker mid-gen-0. `reached`
 * resolves the instant that first call is hit, so the test can latch the stop AFTER gen-0 has started
 * (`generation.started` already persisted) but while the worker is parked — deterministic, no race against
 * the worker's several async DB hops before its g=0 kill-check.
 */
function gatedGateway(opts: { onCall?: () => void } = {}): {
  gateway: ModelGateway;
  open: () => void;
  reached: Promise<void>;
} {
  let open!: () => void;
  let signalReached!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    signalReached = resolve;
  });
  const inner = multiRoleGateway(opts);
  let gated = false;
  return {
    open,
    reached,
    gateway: {
      capabilityFor: (role) => inner.capabilityFor(role),
      call: async (request) => {
        if (!gated) {
          gated = true;
          signalReached();
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

function addressPort(server: { address: () => string | AddressInfo | null }): number {
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('server not listening on a port');
  return addr.port;
}

async function postRun(port: number): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  return { status: res.status, json: await res.json() };
}

async function postStop(port: number, runId: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}/runs/${runId}/stop`, { method: 'POST' });
  return { status: res.status, json: await res.json() };
}

describe('operator-stop rewire — POST /runs/:id/stop signals the kill-and-drain (real PG, gated worker)', () => {
  // spec(§5) — the stop latch is picked up by the in-flight worker, which drains + terminalizes run.stopped.
  test('stop_signals_worker_drains_to_run_stopped', async () => {
    const url = await freshDatabaseUrl();
    const { gateway, open, reached } = gatedGateway();
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway,
      onSettled,
    });
    const port = addressPort(app.server);
    const run = await postRun(port);
    expect(run.status).toBe(201);
    const { runId } = run.json as { runId: string };
    await reached; // gen-0 has started + is parked at its first provider call — now latch the stop.
    const stop = await postStop(port, runId);
    expect(stop.status).toBe(202);
    open(); // release gen-0 → gen-1 kill-check fires → drain.
    await settled;
    const rows = await probeStore(url).readByRun(runId);
    const stopped = rows.filter((r) => r.type === 'run.stopped');
    expect(stopped).toHaveLength(1);
    expect(stopped[0]!.payload).toMatchObject({
      from: 'running',
      to: 'stopping',
      reason: 'operator_stop',
    });
    expect(isRunTerminal(rows)).toBe(true);
    await close();
  });

  // spec(rule #2) — the route appends NOTHING; the only run.stopped is the worker-drained one (actor runtime).
  test('stop_route_appends_nothing', async () => {
    const url = await freshDatabaseUrl();
    const { gateway, open, reached } = gatedGateway();
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway,
      onSettled,
    });
    const port = addressPort(app.server);
    const run = await postRun(port);
    const { runId } = run.json as { runId: string };
    await reached;
    await postStop(port, runId);
    open();
    await settled;
    const stopped = (await probeStore(url).readByRun(runId)).filter(
      (r) => r.type === 'run.stopped',
    );
    expect(stopped).toHaveLength(1);
    expect(stopped.every((r) => r.actor === 'runtime')).toBe(true);
    expect(stopped.some((r) => r.actor === 'operator')).toBe(false);
    await close();
  });

  // spec(rule #2) — stop on an already-terminal run is idempotent: 200 stopped:false, no second terminal.
  test('stop_terminal_run_idempotent', async () => {
    const url = await freshDatabaseUrl();
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url, { DOPPL_MAX_GENERATIONS: '1' }), // completes fast, no stop.
      port: 0,
      host: '127.0.0.1',
      gateway: multiRoleGateway(),
      onSettled,
    });
    const port = addressPort(app.server);
    const run = await postRun(port);
    const { runId } = run.json as { runId: string };
    await settled; // the run terminalizes (completed) on its own.
    const probe = probeStore(url);
    const before = (await probe.readByRun(runId)).length;
    const stop = await postStop(port, runId);
    expect(stop.status).toBe(200);
    expect((stop.json as { stopped?: boolean }).stopped).toBe(false);
    expect((await probe.readByRun(runId)).length).toBe(before); // no new terminal append.
    await close();
  });

  // spec(§11) — stop on an unknown run id → 404 run_not_found.
  test('stop_unknown_run_404', async () => {
    const url = await freshDatabaseUrl();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway: multiRoleGateway(),
    });
    const stop = await postStop(addressPort(app.server), 'no-such-run');
    expect(stop.status).toBe(404);
    expect((stop.json as { error?: string }).error).toBe('run_not_found');
    await close();
  });

  // spec(§5) — generation-boundary drain: the in-progress generation completes, the next never starts.
  test('stop_lets_current_generation_drain_then_stops', async () => {
    const url = await freshDatabaseUrl();
    const { gateway, open, reached } = gatedGateway();
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway,
      onSettled,
    });
    const port = addressPort(app.server);
    const run = await postRun(port);
    const { runId } = run.json as { runId: string };
    await reached; // gen-0 has started (generation.started persisted) + is parked — now latch.
    await postStop(port, runId); // latch while gen-0 is gated mid-flight.
    open();
    await settled;
    const rows = await probeStore(url).readByRun(runId);
    // gen-0 ran (its generation.started is present); gen-1 NEVER started (killed at the boundary).
    expect(rows.filter((r) => r.type === 'generation.started')).toHaveLength(1);
    expect(rows.some((r) => r.type === 'run.stopped')).toBe(true);
    await close();
  });

  // spec(§5) rule #1 — BUG 2 (run 6b714273): a stop latched MID-GENERATION is observed WITHIN that one
  // bounded generation step and halts the run, NOT only at a generation boundary that may never come. The
  // runaway shape was a single generation that, once started, ran to completion (or force-kill) never
  // re-checking the kill. Here the run has ONLY ONE generation: the gateway gates gen-0's first agenome →
  // the stop is latched while gen-0 is mid-flight → the loop observes it WITHIN the generation and drains
  // run.stopped. NOTE (concurrency): agenomes generate CONCURRENTLY, so the bounded step is the population
  // BATCH — the in-flight batch finishes its candidate appends, then the post-batch kill poll observes the
  // stop and halts BEFORE any reproduction / second generation. The rule-#1 guarantee is unchanged: the
  // stop is observed within one bounded step and the run cannot run away (run.stopped, NO reproduction, NO
  // second generation). Pre-fix the loop never re-checked inside a single generation, so the stop was never
  // observed at all.
  test('stop_mid_generation_halts_within_one_generation', async () => {
    const url = await freshDatabaseUrl();
    const { gateway, open, reached } = gatedGateway();
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url, { DOPPL_MAX_GENERATIONS: '1', DOPPL_MAX_POPULATION: '2' }),
      port: 0,
      host: '127.0.0.1',
      gateway,
      onSettled,
    });
    const port = addressPort(app.server);
    const run = await postRun(port);
    const { runId } = run.json as { runId: string };
    await reached; // gen-0's first agenome is gated mid-flight — latch the stop now.
    await postStop(port, runId);
    open();
    await settled;
    const rows = await probeStore(url).readByRun(runId);
    // The stop was observed within the single generation step → run.stopped terminal, and the run was
    // halted BEFORE reproduction and BEFORE any second generation (the in-flight batch's candidates are
    // bounded by maxPopulation = 2; no further work proceeded).
    expect(rows.filter((r) => r.type === 'generation.started')).toHaveLength(1);
    expect(rows.filter((r) => r.type === 'candidate.created').length).toBeLessThanOrEqual(2);
    expect(rows.some((r) => r.type === 'run.stopped')).toBe(true);
    expect(rows.some((r) => r.type === 'agenome.reproduced' || r.type === 'agenome.fused')).toBe(
      false,
    );
    await close();
  });

  // spec(§5) — the route returns an ASYNC accept (202 stopRequested), not a synchronous stopped:true.
  test('stop_response_is_async_accept', async () => {
    const url = await freshDatabaseUrl();
    const { gateway, open, reached } = gatedGateway();
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway,
      onSettled,
    });
    const port = addressPort(app.server);
    const run = await postRun(port);
    const { runId } = run.json as { runId: string };
    await reached;
    const stop = await postStop(port, runId);
    expect(stop.status).toBe(202);
    expect(stop.json).toMatchObject({ runId, stopRequested: true });
    expect((stop.json as { stopped?: boolean }).stopped).toBeUndefined();
    open();
    await settled;
    await close();
  });

  // spec(rule #7) — the stopped run reconstructs deterministically from the log with zero provider calls.
  test('stopped_run_replays_equivalent', async () => {
    const url = await freshDatabaseUrl();
    let calls = 0;
    const { gateway, open, reached } = gatedGateway({ onCall: () => (calls += 1) });
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway,
      onSettled,
    });
    const port = addressPort(app.server);
    const run = await postRun(port);
    const { runId } = run.json as { runId: string };
    await reached;
    await postStop(port, runId);
    open();
    await settled;
    const callsAfterRun = calls;
    const probe = probeStore(url);
    const s1 = buildCurrentState(await probe.readByRun(runId)).state.runs[runId];
    const s2 = buildCurrentState(await probe.readByRun(runId)).state.runs[runId];
    expect(s1?.status).toBe('stopped'); // terminal == stopped.
    expect(s2).toEqual(s1); // deterministic reconstruction (replay-equivalent).
    expect(calls).toBe(callsAfterRun); // re-reading + reconstructing calls NO provider (rule #7).
    await close();
  });

  // spec(§15) — stop does NOT clear activeRunId: a concurrent POST /runs while the run drains → 409.
  test('stop_does_not_clear_active_run_409_while_draining', async () => {
    const url = await freshDatabaseUrl();
    const { gateway, open, reached } = gatedGateway();
    const { onSettled, settled } = settledLatch();
    const { app, close } = await bootApp({
      env: bootEnv(url),
      port: 0,
      host: '127.0.0.1',
      gateway,
      onSettled,
    });
    const port = addressPort(app.server);
    const run = await postRun(port);
    const { runId } = run.json as { runId: string };
    await reached;
    const stop = await postStop(port, runId);
    expect(stop.status).toBe(202);
    // run-1 is still draining (gated, non-terminal in the log) → a concurrent POST /runs is refused.
    const run2 = await postRun(port);
    expect(run2.status).toBe(409);
    expect((run2.json as { error?: string }).error).toBe('run_already_active');
    open();
    await settled;
    await close();
  });

  // The channel's contract — checker is false before request, true after, isolated per runId, clear resets.
  test('operator_stop_registry', () => {
    const registry = createOperatorStopRegistry();
    const checkA = registry.checker('run-a');
    const checkB = registry.checker('run-b');
    expect(checkA()).toBe(false);
    registry.request('run-a');
    expect(checkA()).toBe(true); // latched.
    expect(checkB()).toBe(false); // isolated per runId.
    registry.clear('run-a');
    expect(checkA()).toBe(false); // cleared.
  });
});
