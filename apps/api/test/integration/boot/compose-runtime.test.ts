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
import type { RunConfig } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { createGateway, type ModelGateway, type ProviderCallFn } from '../../../src/model-gateway';
import { loadConfig } from '../../../src/runtime/config/loadConfig';
import { runWorker } from '../../../src/runtime';
import { CHECK_RUNNER_REGISTRY } from '../../../src/check-runners/registry';
import { composeRunWorkerDeps } from '../../../src/boot/composeRuntime';
import { DEFAULT_JUDGE_RUBRIC } from '../../../src/verifier/judge/rubric';
import { JUDGE_AXIS_MAX_SCORE } from '../../../src/selection/components/judge-acceptance';
import { judgeFakeOutput } from '../_support/judge-output';

// The maximum acceptance representable under the production rubric (Σ axis weights × the per-axis max) —
// the score seam divides JudgeResult.acceptance by this to bring the held-out-judge component onto [0,1].
const JUDGE_MAX_ACCEPTANCE = DEFAULT_JUDGE_RUBRIC.axes.reduce(
  (sum, axis) => sum + JUDGE_AXIS_MAX_SCORE * (DEFAULT_JUDGE_RUBRIC.weights[axis] ?? 0),
  0,
);

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

function compose(runId: string, onCall?: () => void, perRunConfig?: RunConfig) {
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
    ...(perRunConfig !== undefined ? { perRunConfig } : {}),
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

  // TU.5 — with the live tool seams provided, the population_generator gateway is the tool-orchestrating
  // gateway (agents do their own research). The reachability proof for the composeRuntime wiring branch:
  // a tool-call response is executed via the injected webSearch seam + surfaced as an observation; absent
  // seams (every other test) the pass-through gateway is wired (no tool relay).
  test('test_tool_executor_seams_wire_the_tool_orchestrating_gateway', async () => {
    let call = 0;
    const toolThenFinal: ModelGateway = {
      capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
      call: () => {
        call += 1;
        return Promise.resolve(
          call === 1
            ? {
                accepted: true,
                validationResult: 'accepted',
                providerMeta: validProviderMeta,
                toolCallRequests: [{ id: 'c1', name: 'web_search', arguments: '{"query":"x"}' }],
              }
            : {
                accepted: true,
                validationResult: 'accepted',
                providerMeta: validProviderMeta,
                output: { idea: 'grounded' },
              },
        );
      },
    };
    const deps = composeRunWorkerDeps({
      config: buildConfig(),
      modelGateway: toolThenFinal,
      eventStore: store,
      checkRegistry: CHECK_RUNNER_REGISTRY,
      listRunIds: () => Promise.resolve(['tool-wire']),
      newId: () => 'tool-wire-sid',
      runId: 'tool-wire',
      toolExecutorSeams: {
        webSearch: (query) => Promise.resolve(`grounded results: ${query}`),
        httpGet: () => Promise.resolve({ status: 200, text: '' }),
        resolveHostIsPublic: () => Promise.resolve(true),
      },
    });
    const result = await deps.gateway.generate(
      { role: 'population_generator', prompt: 'go' },
      { toolBudget: 4 },
    );
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toMatchObject({ toolName: 'web_search', ok: true });
    expect(result.response.output).toEqual({ idea: 'grounded' });
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
    // persisted JudgeResult.acceptance NORMALIZED to [0,1] (÷ the rubric's max acceptance) — proving the
    // score seam validated against the SAME rubric (version matched), so the candidateId-join produced a
    // PRESENT value, not the version-mismatch 0. The acceptance is read VERBATIM upstream (rule #6); the
    // scorer only RESCALES the derived fitness component so a raw 0-25 metric does not dominate the average.
    let pinned = false;
    for (const jr of judgeRows) {
      const judge = JudgeResult.parse(jr.payload);
      const fitnessRow = rows.find(
        (r) => r.type === 'fitness.scored' && r.candidateId === judge.candidateId,
      );
      if (fitnessRow === undefined) continue;
      const fitness = FitnessScore.parse(fitnessRow.payload);
      expect(fitness.components.judge_acceptance).toBeCloseTo(
        judge.acceptance / JUDGE_MAX_ACCEPTANCE,
        12,
      );
      expect(fitness.components.judge_acceptance).toBeGreaterThan(0); // present (not the absent default 0).
      expect(fitness.components.judge_acceptance).toBeLessThanOrEqual(1); // normalized, never raw 0-25.
      expect(judge.acceptance).toBeGreaterThan(0); // a real, present acceptance.
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

    // gen N+1 evolves from gen N: with elitism (eliteCount default 1) gen-1's population is the carried-
    // forward top survivor(s) PLUS gen-0's reproduced offspring (clamped to maxPopulation). So every gen-1
    // agenome is either a gen-0 reproduced offspring OR a carried-forward gen-0 survivor (an elite seed).
    const gen0Offspring = new Set(
      rows
        .filter(
          (r) =>
            (r.type === 'agenome.fused' || r.type === 'agenome.reproduced') &&
            r.generationId === `${runId}-gen0`,
        )
        .map((r) => ReproductionEvent.parse(r.payload).childAgenomeId),
    );
    const gen0Parents = new Set(
      rows
        .filter((r) => r.type === 'candidate.created' && r.generationId === `${runId}-gen0`)
        .map((r) => r.agenomeId)
        .filter((id): id is string => id !== null),
    );
    const gen1Agenomes = new Set(
      rows
        .filter((r) => r.type === 'candidate.created' && r.generationId === `${runId}-gen1`)
        .map((r) => r.agenomeId)
        .filter((id): id is string => id !== null),
    );
    expect(gen0Offspring.size).toBeGreaterThan(0);
    for (const agenomeId of gen1Agenomes) {
      expect(gen0Offspring.has(agenomeId) || gen0Parents.has(agenomeId)).toBe(true);
    }
    expect([...gen1Agenomes].some((a) => gen0Parents.has(a))).toBe(true); // ≥1 elite carried forward…
    expect([...gen1Agenomes].some((a) => gen0Offspring.has(a))).toBe(true); // …alongside ≥1 offspring.

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

  // spec(§8/§11) W3b-2c — composeRunWorkerDeps merges a per-run RunConfig over the boot AppConfig:
  // caps/rngSeed/enabledSubtypes come from the per-run config, the immutables (scoringPolicy/seedSet) stay
  // boot. (The judge rubric is wired from DEFAULT_JUDGE_RUBRIC, never the per-run config — rule #6.)
  test('test_merge_keeps_boot_immutables', () => {
    const boot = buildConfig();
    const perRun: RunConfig = {
      ...boot.runConfig,
      rngSeed: 999,
      enabledSubtypes: ['cross_domain_transfer'],
      caps: { ...boot.caps, maxGenerations: 1 },
    };
    const deps = compose('merge-immutables', undefined, perRun);
    // boot immutables retained (value-equal — compose builds its own boot instance, so not ref-equal):
    expect(deps.config.scoringPolicy).toEqual(boot.scoringPolicy);
    expect(deps.config.seedSet).toEqual(boot.seedSet);
    expect(deps.config.runConfig.scoringPolicyVersion).toBe(boot.runConfig.scoringPolicyVersion);
    // per-run overrides applied:
    expect(deps.config.runConfig.rngSeed).toBe(999);
    expect(deps.config.runConfig.enabledSubtypes).toEqual(['cross_domain_transfer']);
    expect(deps.config.caps.maxGenerations).toBe(1);
  });

  // spec(§5/§8) rule #1 (load-bearing) — a per-run cap ABOVE the boot ceiling is CLAMPED to the boot
  // ceiling (a posted config LOWERS, never RAISES) — defense-in-depth beyond the route's 422.
  test('test_posted_cap_clamped_to_boot_ceiling', () => {
    const boot = buildConfig();
    const overCeiling: RunConfig = {
      ...boot.runConfig,
      caps: { ...boot.caps, maxPopulation: boot.caps.maxPopulation + 100 },
    };
    const deps = compose('merge-clamp', undefined, overCeiling);
    expect(deps.config.caps.maxPopulation).toBe(boot.caps.maxPopulation); // clamped, never raised.
    expect(deps.config.runConfig.caps.maxPopulation).toBe(boot.caps.maxPopulation); // both caps fields.
  });

  // spec(§8) recorded == executed — the worker runs the RECORDED per-run config, not the boot default:
  // a per-run maxGenerations:1 → exactly ONE generation runs (the boot default is 2).
  test('test_worker_runs_recorded_config_not_boot_default', async () => {
    const runId = 'merge-recorded';
    const boot = buildConfig();
    const perRun: RunConfig = { ...boot.runConfig, caps: { ...boot.caps, maxGenerations: 1 } };
    await seedConfigured(runId);
    await runWorker(compose(runId, undefined, perRun));
    const rows = await store.readByRun(runId);
    expect(rows.filter((r) => r.type === 'generation.started')).toHaveLength(1); // maxGenerations:1.
  });

  // spec — absent per-run config → boot defaults (defensive; composeRunWorkerDeps without perRunConfig
  // uses the boot AppConfig unchanged).
  test('test_absent_perRunConfig_uses_boot', () => {
    const boot = buildConfig();
    const deps = compose('merge-absent'); // no perRunConfig.
    expect(deps.config.caps.maxGenerations).toBe(boot.caps.maxGenerations); // boot (2), not merged.
  });

  // spec(§5, PD.10 commit 1) — the per-run PROBLEM (RunConfig.seed) is threaded into the worker config so
  // it reaches the generation loop. Today mergePerRunConfig drops `seed` (merges only rngSeed/enabledSubtypes/
  // caps) → the operator's problem never shapes the run. Pins the thread; immutables stay boot.
  test('test_merge_threads_per_run_seed', () => {
    const boot = buildConfig();
    const problem = 'design a low-cost off-grid water filter';
    expect(boot.runConfig.seed).not.toBe(problem); // guard: the test seed differs from the boot default.
    const perRun: RunConfig = { ...boot.runConfig, seed: problem };
    const deps = compose('merge-seed', undefined, perRun);
    expect(deps.config.runConfig.seed).toBe(problem); // the problem is threaded through to the loop.
    expect(deps.config.scoringPolicy).toEqual(boot.scoringPolicy); // immutables unchanged.
  });
});
