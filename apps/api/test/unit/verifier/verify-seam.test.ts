import { describe, expect, test, vi } from 'vitest';
import {
  CheckResult,
  CriticReview,
  JudgeResult,
  RunEventEnvelope,
  validateEventPayload,
  validCandidateIdeaCrossDomain,
  validCandidateIdeaZeitgeist,
  validProviderMeta,
  type CandidateIdea,
  type ModelGatewayRequest,
  type ModelGatewayResponse,
} from '@doppl/contracts';
import type { AppendInput, AppendResult, EventStore, RunEventRow } from '../../../src/event-store';
import { CHECK_RUNNER_REGISTRY } from '../../../src/check-runners/registry';
import { selectCriticMandates } from '../../../src/verifier/council/rotation';
import type { ModelGateway } from '../../../src/model-gateway';
import { loadConfig } from '../../../src/runtime/config/loadConfig';
import type { SeamContext, VerifySeam } from '../../../src/runtime/loop/generationLoop';
import { createVerifySeam } from '../../../src/verifier/verify-seam';

/**
 * P4.12 unified VerifySeam adapter — composition unit tests (ARCHITECTURE.md §7/§5/§2.5/§4, KEY SAFETY
 * RULES #3/#5/#6/#8). createVerifySeam(deps) returns the kernel loop's frozen `verify` port and, per
 * candidate handed in as DATA, drives the rotating critic council + the subtype-matched allowlisted checks
 * + the held-out judge by COMPOSING the already-shipped P4.6/P4.7/P4.8/P4.5 modules, emitting ONLY via the
 * injected per-generation `ctx.append`. Fake ctx.append (running the real envelope+payload validation
 * discipline), fake multi-role gateway, real registry. The real-PG loop proof is the integration sibling.
 */

const RNG_SEED = 42; // DEFAULT_RUN_CONFIG.rngSeed (the run-level constant readRngSeed reads)
const VALID_ENV: Record<string, string | undefined> = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};
const config = loadConfig({ env: VALID_ENV, fileSources: {} });

// Per-axis judge model output (the fake gateway's stale `final_judge` fixture is `{score:3}`, which does
// NOT satisfy the P4.8 JudgeModelOutput — so the seam tests use a multi-role gateway, mirroring the
// established run-judge.test.ts `judgeGateway` precedent).
const PER_AXIS = {
  grounding: 4,
  novelty: 3,
  feasibility: 5,
  falsification_survival: 2,
  subtype_check_pass: 4,
};

// Wave 2 Step 4 — the judge is HOISTED to ONE peer-context call per generation, so a multi-candidate request
// carries `[CANDIDATE ref=N]` DATA blobs → return the comparative `{candidates:[{ref,...}]}` shape; a
// single-candidate generation uses the flat runJudge request (no ref labels) → return the flat per-axis shape.
function judgeOutput(request: ModelGatewayRequest): unknown {
  const refs = (request.messages ?? [])
    .filter((m) => m.role === 'user')
    .map((m) => /\[CANDIDATE ref=([^\]]+)\]/.exec(m.content)?.[1])
    .filter((r): r is string => r !== undefined);
  return refs.length === 0 ? PER_AXIS : { candidates: refs.map((ref) => ({ ref, ...PER_AXIS })) };
}

/** Multi-role fake ModelGateway: critic output for the council, per-axis output for the held-out judge. */
function verifyGateway(): ModelGateway {
  return {
    call: (request: ModelGatewayRequest): Promise<ModelGatewayResponse> =>
      Promise.resolve({
        accepted: true,
        validationResult: 'accepted',
        output:
          request.role === 'final_judge'
            ? judgeOutput(request)
            : { critique: 'stub critique', confidence: 0.5 },
        providerMeta: validProviderMeta,
      }),
    capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
  };
}

const AppendEnvelope = RunEventEnvelope.omit({ sequence: true, occurredAt: true });

/**
 * A capturing `ctx.append` that runs the REAL append-path discipline (envelope omit-parse +
 * validateEventPayload narrowing) — so a malformed seam emit fails exactly as the real P1.3 path would,
 * and every captured write is assertable. Returns an incrementing AppendResult sequence.
 */
function makeCtxAppend() {
  const captured: AppendInput[] = [];
  let seq = 0;
  const append = async (input: AppendInput): Promise<AppendResult> => {
    captured.push(input);
    const parsed = AppendEnvelope.safeParse(input);
    if (!parsed.success) throw new Error(`ctx.append: invalid envelope (${input.type})`);
    const validated = validateEventPayload(input.type, input.payload);
    if (!validated.ok)
      throw new Error(`ctx.append: payload rejected (${input.type}) — ${validated.reason}`);
    seq += 1;
    return { id: input.id, runId: input.runId, sequence: seq - 1 };
  };
  const forCandidate = (id: string) => captured.filter((c) => c.candidateId === id);
  return { append, captured, forCandidate };
}

/**
 * deps.eventStore: a READ-ONLY-for-the-seam store. `append` is a throwing spy that must never be called
 * (the seam emits via the injected ctx.append, never a deps-closure write); `readByRun` returns a seeded
 * `generation.started{generationId,index}` row (the authoritative per-generation index source — Option A).
 */
function makeDepsEventStore(opts: { generationId: string; index: number }) {
  const appendSpy = vi.fn(async (): Promise<AppendResult> => {
    throw new Error('deps.eventStore.append must never be called — the seam emits via ctx.append');
  });
  const genStarted = {
    type: 'generation.started',
    generationId: opts.generationId,
    payload: { generationId: opts.generationId, index: opts.index },
  } as unknown as RunEventRow;
  const readByRun = vi.fn(async (): Promise<RunEventRow[]> => [genStarted]);
  const store: EventStore = {
    append: appendSpy as unknown as EventStore['append'],
    readByRun: readByRun as unknown as EventStore['readByRun'],
  };
  return { store, appendSpy, readByRun };
}

function deps(store: EventStore) {
  return { gateway: verifyGateway(), eventStore: store, registry: CHECK_RUNNER_REGISTRY, config };
}

function ctxFor(runId: string, generationId: string, append: SeamContext['append']): SeamContext {
  return { runId, generationId, append };
}

const xdomain = (id: string): CandidateIdea => ({ ...validCandidateIdeaCrossDomain, id });

describe('createVerifySeam — composition over council/checks/judge behind the kernel verify port', () => {
  // spec(§5) — a value from createVerifySeam(deps) is the kernel `VerifySeam` type ((candidates, ctx) =>
  // Promise<void>); the smoke call resolves to void.
  test('test_seam_assignable_to_verify_port', async () => {
    const { store } = makeDepsEventStore({ generationId: 'r1-gen0', index: 0 });
    const ctx = makeCtxAppend();
    const seam: VerifySeam = createVerifySeam(deps(store));
    const result = await seam([], ctxFor('r1', 'r1-gen0', ctx.append));
    expect(result).toBeUndefined();
    expect(ctx.captured.length).toBe(0); // no candidates → no per-candidate work
  });

  // spec(§7) — for each candidate the council + checks + judge each run: ≥1 critic.review_started+reviewed,
  // ≥1 check.started+completed, exactly one judge.review_started+reviewed.
  test('test_three_subsystems_invoked_per_candidate', async () => {
    const { store } = makeDepsEventStore({ generationId: 'r-gen0', index: 0 });
    const ctx = makeCtxAppend();
    const seam = createVerifySeam(deps(store));
    await seam([xdomain('cand-A'), xdomain('cand-B')], ctxFor('r', 'r-gen0', ctx.append));
    for (const id of ['cand-A', 'cand-B']) {
      const types = ctx.forCandidate(id).map((c) => c.type);
      const count = (t: string) => types.filter((x) => x === t).length;
      expect(count('critic.review_started')).toBeGreaterThanOrEqual(1);
      expect(count('critic.reviewed')).toBeGreaterThanOrEqual(1);
      expect(count('check.started')).toBeGreaterThanOrEqual(1);
      expect(count('check.completed')).toBeGreaterThanOrEqual(1);
      expect(count('judge.review_started')).toBe(1);
      expect(count('judge.reviewed')).toBe(1);
    }
  });

  // spec(§2.5/§7) — every judge.reviewed carries candidateId === candidate.id (selection's fitness join is
  // BY candidateId — load-bearing) and a payload that JudgeResult.safeParse-s (frozen seam shape).
  test('test_judge_reviewed_keyed_by_candidate_id', async () => {
    const { store } = makeDepsEventStore({ generationId: 'r-gen0', index: 0 });
    const ctx = makeCtxAppend();
    const seam = createVerifySeam(deps(store));
    await seam([xdomain('cand-A'), xdomain('cand-B')], ctxFor('r', 'r-gen0', ctx.append));
    const reviewed = ctx.captured.filter((c) => c.type === 'judge.reviewed');
    expect(reviewed.map((w) => w.candidateId).sort()).toEqual(['cand-A', 'cand-B']);
    for (const w of reviewed) {
      const parsed = JudgeResult.safeParse(w.payload);
      expect(parsed.success).toBe(true);
      expect(parsed.success ? parsed.data.candidateId : null).toBe(w.candidateId);
    }
  });

  // spec(§7) — the active mandate set equals selectCriticMandates({rngSeed,generationIndex}), is identical
  // across every candidate in the generation, and the per-generation index is read ONCE (not per candidate).
  test('test_mandates_selected_once_per_generation', async () => {
    const { store, readByRun } = makeDepsEventStore({ generationId: 'r-gen0', index: 2 });
    const ctx = makeCtxAppend();
    const seam = createVerifySeam(deps(store));
    await seam([xdomain('cand-A'), xdomain('cand-B')], ctxFor('r', 'r-gen0', ctx.append));
    const expected = new Set(selectCriticMandates({ rngSeed: RNG_SEED, generationIndex: 2 }));
    const mandatesFor = (id: string) =>
      new Set(
        ctx
          .forCandidate(id)
          .filter((c) => c.type === 'critic.reviewed')
          .map((c) => (c.payload as CriticReview).mandate),
      );
    expect(mandatesFor('cand-A')).toEqual(expected);
    expect(mandatesFor('cand-B')).toEqual(expected);
    expect(readByRun).toHaveBeenCalledTimes(1);
  });

  // spec(§4) Option A — generationIndex comes from the persisted generation.started{index:2}, NOT the
  // generationId STRING (which trails 'gen0'): the mandate set matches index 2, and differs from index 0.
  test('test_generation_index_read_from_persisted_started_event', async () => {
    const { store } = makeDepsEventStore({ generationId: 'run-x-gen0', index: 2 });
    const ctx = makeCtxAppend();
    const seam = createVerifySeam(deps(store));
    await seam([xdomain('cand-A')], ctxFor('run-x', 'run-x-gen0', ctx.append));
    const actual = new Set(
      ctx
        .forCandidate('cand-A')
        .filter((c) => c.type === 'critic.reviewed')
        .map((c) => (c.payload as CriticReview).mandate),
    );
    expect(actual).toEqual(
      new Set(selectCriticMandates({ rngSeed: RNG_SEED, generationIndex: 2 })),
    );
    expect(actual).not.toEqual(
      new Set(selectCriticMandates({ rngSeed: RNG_SEED, generationIndex: 0 })),
    );
  });

  // spec(§5) — every emit flows through the injected ctx.append; deps.eventStore.append is NEVER called.
  test('test_emits_only_via_ctx_append', async () => {
    const { store, appendSpy } = makeDepsEventStore({ generationId: 'r-gen0', index: 0 });
    const ctx = makeCtxAppend();
    const seam = createVerifySeam(deps(store));
    await seam([xdomain('cand-A')], ctxFor('r', 'r-gen0', ctx.append));
    expect(appendSpy).not.toHaveBeenCalled();
    expect(ctx.captured.length).toBeGreaterThan(0);
  });

  // spec(§5)/rule #8 — the seam authors ONLY its own evidence events; no kernel lifecycle / candidate.created
  // / energy.spent / agenome.* type ever appears.
  test('test_no_kernel_owned_or_energy_events_authored', async () => {
    const { store } = makeDepsEventStore({ generationId: 'r-gen0', index: 0 });
    const ctx = makeCtxAppend();
    const seam = createVerifySeam(deps(store));
    await seam([xdomain('cand-A')], ctxFor('r', 'r-gen0', ctx.append));
    const allowed = new Set([
      'critic.review_started',
      'critic.reviewed',
      'check.started',
      'check.completed',
      'judge.review_started',
      'judge.reviewed',
      'output_schema_rejected',
    ]);
    for (const c of ctx.captured) expect(allowed.has(c.type), c.type).toBe(true);
  });

  // spec(§7)/rule #3 — STRICT subtype filtering: a cross_domain_transfer candidate runs the transfer
  // deterministic adapters (passed/failed) + the grounding adapter records skipped{retrieval_unavailable}
  // (no thread); the zeitgeist adapters do NOT run, and NEITHER do the subtype-less P4.5 `prepared.*`
  // placeholders (strict match excludes them — no spurious check.completed feeds selection's fitness read).
  test('test_subtype_checks_selected_and_grounding_skips', async () => {
    const { store } = makeDepsEventStore({ generationId: 'r-gen0', index: 0 });
    const ctx = makeCtxAppend();
    const seam = createVerifySeam(deps(store));
    await seam([xdomain('cand-A')], ctxFor('r', 'r-gen0', ctx.append));
    const completed = ctx.captured
      .filter((c) => c.type === 'check.completed')
      .map((c) => c.payload as CheckResult);
    const byType = new Map(completed.map((r) => [r.checkType, r]));
    // all 5 transfer adapters RAN (the seam runs every subtype-matched adapter).
    for (const ct of [
      'transfer.source_validity',
      'transfer.target_fit',
      'transfer.mapping_quality',
      'transfer.allowlisted_executable',
      'transfer.prior_art',
    ]) {
      expect(byType.has(ct), ct).toBe(true);
    }
    // the 3 pure-deterministic adapters EVALUATED the candidate payload as DATA (passed/failed, never
    // skipped) — proving the seam fed `JSON.stringify(candidate.subtypePayload)` through parseably.
    for (const ct of [
      'transfer.source_validity',
      'transfer.target_fit',
      'transfer.mapping_quality',
    ]) {
      expect(['passed', 'failed'], ct).toContain(byType.get(ct)?.status);
    }
    // the grounding adapter skips because the seam threads NO retrievalResults (load-bearing wiring choice).
    expect(byType.get('transfer.prior_art')?.status).toBe('skipped');
    expect(byType.get('transfer.prior_art')?.skipReason).toBe('retrieval_unavailable');
    // neither the zeitgeist (wrong subtype) NOR the subtype-less placeholders run.
    for (const ct of [
      'zeitgeist.novelty',
      'zeitgeist.timing',
      'zeitgeist.coherence',
      'zeitgeist.current_signal_grounding',
      'zeitgeist.falsifiability',
      'prepared_deterministic_toy',
      'prepared_execution_requiring',
    ]) {
      expect(byType.has(ct), ct).toBe(false);
    }
  });

  // spec(§7) — the converse STRICT filter: a zeitgeist_synthesis candidate runs the zeitgeist adapters and
  // NEITHER the transfer adapters NOR the subtype-less `prepared.*` placeholders (proves the filter is
  // candidate-driven + strict, not hard-coded to transfer and not auto-applying subtype-less descriptors).
  test('test_subtype_filter_runs_zeitgeist_for_zeitgeist_candidate', async () => {
    const { store } = makeDepsEventStore({ generationId: 'r-gen0', index: 0 });
    const ctx = makeCtxAppend();
    const seam = createVerifySeam(deps(store));
    const zeit: CandidateIdea = { ...validCandidateIdeaZeitgeist, id: 'cand-Z' };
    await seam([zeit], ctxFor('r', 'r-gen0', ctx.append));
    const types = new Set(
      ctx.captured
        .filter((c) => c.type === 'check.completed')
        .map((c) => (c.payload as CheckResult).checkType),
    );
    expect(types.has('zeitgeist.novelty')).toBe(true);
    for (const ct of [
      'transfer.source_validity',
      'transfer.target_fit',
      'transfer.mapping_quality',
      'transfer.allowlisted_executable',
      'transfer.prior_art',
      'prepared_deterministic_toy',
      'prepared_execution_requiring',
    ]) {
      expect(types.has(ct), ct).toBe(false);
    }
  });
});
