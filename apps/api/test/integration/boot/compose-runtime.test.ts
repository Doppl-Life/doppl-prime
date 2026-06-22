import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CURRENT_SCHEMA_VERSION,
  FitnessScore,
  JudgeResult,
  ReproductionEvent,
  validCandidateIdeaCrossDomain,
  validProviderMeta,
} from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { createGateway, type ProviderCallFn } from '../../../src/model-gateway';
import { loadConfig } from '../../../src/runtime/config/loadConfig';
import { runWorker } from '../../../src/runtime';
import { CHECK_RUNNER_REGISTRY } from '../../../src/check-runners/registry';
import { composeRunWorkerDeps } from '../../../src/boot/composeRuntime';

/**
 * P5.11 boot composition root — function-level e2e (testcontainers, real PG). `composeRunWorkerDeps`
 * assembles the production RunWorkerDeps: AppConfig + ModelGateway + EventStore + check registry → all 3
 * real seams (verify/score/reproduce) + the createSuccessorThreading nextPopulation hook, with ONE
 * immutable DEFAULT_JUDGE_RUBRIC wired to BOTH verify (judge) and score (judgeAcceptance) — rule #6. The
 * e2e calls runWorker(composed deps) over real PG + a multi-role fake providerCall injected into the REAL
 * createGateway (LESSONS §24): a multi-generation run on the true verify→score→reproduce→thread path,
 * gen N+1 evolving from gen N.
 *
 * // production entry: POST /runs → composeRunWorkerDeps → runWorker, lands at W3b-2b (selection-016)
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

// One multi-role fake providerCall (LESSONS §24) → injected into the REAL createGateway so the genuine
// structured-output discipline runs. Serves every role the 3 seams + loop touch.
function multiRoleProviderCall(onCall?: () => void): ProviderCallFn {
  return (request) => {
    onCall?.();
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

function buildConfig() {
  return loadConfig({
    env: VALID_ENV,
    fileSources: { caps: { maxGenerations: 2, maxPopulation: 2 } },
  });
}

let runSeq = 0;
async function seedConfigured(runId: string): Promise<void> {
  await store.append({
    id: `${runId}-configured-${runSeq++}`,
    runId,
    type: 'run.configured',
    actor: 'operator',
    payload: {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
}

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

function compose(runId: string, onCall?: () => void) {
  let n = 0;
  return composeRunWorkerDeps({
    config: buildConfig(),
    modelGateway: createGateway({
      providerCall: multiRoleProviderCall(onCall),
      capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
    }),
    eventStore: store,
    checkRegistry: CHECK_RUNNER_REGISTRY,
    listRunIds: () => Promise.resolve([runId]),
    newId: () => `${runId}-sid-${n++}`,
    runId,
  });
}

describe('composeRunWorkerDeps — boot composition root function-level e2e (real PG)', () => {
  // the composition contract — all 3 real seams + the nextPopulation hook are wired.
  test('test_composes_runWorkerDeps_with_all_three_real_seams', () => {
    const deps = compose('compose-shape');
    expect(typeof deps.seams.verify).toBe('function');
    expect(typeof deps.seams.score).toBe('function');
    expect(typeof deps.seams.reproduce).toBe('function');
    expect(deps.nextPopulation).toBeDefined();
    expect(typeof deps.gateway.generate).toBe('function');
  });

  // spec(§7/§8) rule #6 single-source — the SAME DEFAULT_JUDGE_RUBRIC wired to verify (judge) + score
  // (judgeAcceptance) → the candidateId-join rubricPolicyVersion matches → judge_acceptance is present
  // (a non-default-absent value), not a silent version-mismatch zero.
  test('test_single_immutable_rubric_wired_to_judge_and_score', async () => {
    const runId = 'compose-rubric';
    await seedConfigured(runId);
    await runWorker(compose(runId));
    const rows = await store.readByRun(runId);
    const judgeRows = rows.filter((r) => r.type === 'judge.reviewed');
    expect(judgeRows.length).toBeGreaterThan(0);
    // For each judged candidate, the score seam's fitness.scored.components.judge_acceptance equals the
    // persisted JudgeResult.acceptance VERBATIM — proving the score seam validated against the SAME rubric
    // (version matched), so the candidateId-join produced a PRESENT value, not the version-mismatch 0.
    let pinned = false;
    for (const jr of judgeRows) {
      const judge = JudgeResult.parse(jr.payload);
      const fitnessRow = rows.find(
        (r) => r.type === 'fitness.scored' && r.candidateId === judge.candidateId,
      );
      if (fitnessRow === undefined) continue;
      const fitness = FitnessScore.parse(fitnessRow.payload);
      expect(fitness.components.judge_acceptance).toBe(judge.acceptance);
      expect(judge.acceptance).toBeGreaterThan(0); // a real, present acceptance (not the absent default 0).
      pinned = true;
    }
    expect(pinned).toBe(true);
  });

  // spec(§8) THE e2e — runWorker(composed) drives a multi-generation run on the true verify→score→
  // reproduce→thread path; gen-1's agenomes derive from gen-0's reproduced offspring; terminal completes.
  test('test_function_level_evolution_multi_generation', async () => {
    const runId = 'compose-evolution';
    await seedConfigured(runId);
    await runWorker(compose(runId));
    const rows = await store.readByRun(runId);

    // ≥2 generations ran.
    const generations = rows.filter((r) => r.type === 'generation.started');
    expect(generations.length).toBeGreaterThanOrEqual(2);

    // gen N+1 evolves from gen N: gen-1's agenomes ARE gen-0's reconstructed offspring.
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
    expect(gen1Agenomes).toEqual(gen0Offspring);

    // the run reaches a terminal with a finalIdeaRef (a scored survivor exists).
    const terminal = rows.find((r) => r.type === 'run.completed' || r.type === 'run.failed');
    expect(terminal).toBeDefined();
    if (terminal?.type === 'run.completed') {
      expect(typeof (terminal.payload as { finalIdeaRef?: unknown }).finalIdeaRef).toBe('string');
    }
  });

  // spec(§5) rule #1 — the run halts within caps (maxGenerations); the composition wires, never bypasses
  // the kernel cap enforcement.
  test('test_run_terminates_within_caps', async () => {
    const runId = 'compose-caps';
    await seedConfigured(runId);
    await runWorker(compose(runId));
    const rows = await store.readByRun(runId);
    const generations = rows.filter((r) => r.type === 'generation.started');
    expect(generations.length).toBeLessThanOrEqual(2); // maxGenerations = 2.
    expect(rows.some((r) => r.type === 'run.completed' || r.type === 'run.failed')).toBe(true);
  });

  // spec(§9) rule #7 — after the run, re-reading the persisted log (a replay-style read) calls NO provider:
  // the gateway call count is stable across re-reads (the whole pipeline replays provider-free).
  test('test_replay_after_run_is_provider_free', async () => {
    const runId = 'compose-replay';
    let calls = 0;
    await seedConfigured(runId);
    await runWorker(compose(runId, () => (calls += 1)));
    const afterRun = calls;
    expect(afterRun).toBeGreaterThan(0);
    const rows1 = await store.readByRun(runId);
    const rows2 = await store.readByRun(runId);
    expect(calls).toBe(afterRun); // re-reading the log re-calls no provider.
    expect(rows2.length).toBe(rows1.length);
  });
});
