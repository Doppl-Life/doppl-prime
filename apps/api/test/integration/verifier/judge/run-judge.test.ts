import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { JudgeResult, validCandidateIdeaCrossDomain, validProviderMeta } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../../src/event-store';
import { createFakeGateway, type ModelGateway } from '../../../../src/model-gateway';
import { runJudge } from '../../../../src/verifier/judge/judge-call';

/**
 * P4.8 held-out judge runner — integration (testcontainers, real PG), reconciled to the P0.16 seam
 * (verifier-010). spec(§4) the judge.review_started→judge.reviewed pair lands via the real append path;
 * spec(§7/§8) the persisted judge.reviewed payload is the frozen JudgeResult (narrowed by the payload-map
 * on append, fail-closed); spec(§9)/rule #7 axisScores + acceptance are persisted (replay reads them, no
 * re-judge). A rejected output emits output_schema_rejected + NO judge.reviewed. Mirrors append.test.ts.
 */

const PER_AXIS_OUTPUT = {
  grounding: 4,
  novelty: 3,
  feasibility: 5,
  falsification_survival: 2,
  subtype_check_pass: 4,
};
const EXPECTED_ACCEPTANCE = 18;

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

function judgeGateway(output: unknown): ModelGateway {
  return {
    call: () =>
      Promise.resolve({
        accepted: true,
        validationResult: 'accepted' as const,
        output,
        providerMeta: validProviderMeta,
      }),
    capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
  };
}

function runContext(runId: string) {
  return { runId, generationId: 'gen_1', candidateId: validCandidateIdeaCrossDomain.id };
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('runJudge — judge.review_started→judge.reviewed pair through the real append path', () => {
  // spec(§4/§8) — an accepted judge run emits judge.review_started (seq N, actor selection_controller)
  // then judge.reviewed (seq N+1); the judge.reviewed payload JudgeResult.safeParse-s (narrowed by the
  // payload-map on append) and equals the produced result. NO energy / fitness.scored here.
  test('test_review_started_then_reviewed_pair_persisted', async () => {
    const runId = 'run-judge-pair';
    const judged = await runJudge({
      gateway: judgeGateway(PER_AXIS_OUTPUT),
      store,
      candidate: validCandidateIdeaCrossDomain,
      runContext: runContext(runId),
    });
    expect(judged?.acceptance).toBe(EXPECTED_ACCEPTANCE);
    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.type)).toEqual(['judge.review_started', 'judge.reviewed']);
    expect(rows.map((r) => r.sequence)).toEqual([0, 1]);
    expect(rows.map((r) => r.actor)).toEqual(['selection_controller', 'selection_controller']);
    const reviewed = rows.find((r) => r.type === 'judge.reviewed');
    const parsed = JudgeResult.safeParse(reviewed?.payload);
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data : null).toEqual(judged);
    const types = rows.map((r) => r.type);
    expect(types).not.toContain('energy.spent');
    expect(types).not.toContain('fitness.scored');
  });

  // spec(§9) rule #7 — judge.reviewed is the replay home: the persisted payload carries axisScores +
  // acceptance, so replay reads the record and never re-judges.
  test('test_judge_reviewed_is_replay_home', async () => {
    const runId = 'run-judge-replay-home';
    await runJudge({
      gateway: judgeGateway(PER_AXIS_OUTPUT),
      store,
      candidate: validCandidateIdeaCrossDomain,
      runContext: runContext(runId),
    });
    const rows = await store.readByRun(runId);
    const reviewed = rows.find((r) => r.type === 'judge.reviewed');
    const parsed = JudgeResult.safeParse(reviewed?.payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.axisScores).toEqual(PER_AXIS_OUTPUT);
      expect(parsed.data.acceptance).toBe(EXPECTED_ACCEPTANCE);
    }
  });

  // spec(§7) — a rejected judge output emits output_schema_rejected (after the started marker), NO
  // judge.reviewed, and returns null — never a fabricated record.
  test('test_rejection_emits_rejected_no_reviewed', async () => {
    const runId = 'run-judge-reject';
    const judged = await runJudge({
      gateway: createFakeGateway({ mode: 'reject' }),
      store,
      candidate: validCandidateIdeaCrossDomain,
      runContext: runContext(runId),
    });
    expect(judged).toBeNull();
    const types = (await store.readByRun(runId)).map((r) => r.type);
    expect(types).toEqual(['judge.review_started', 'output_schema_rejected']);
    expect(types).not.toContain('judge.reviewed');
  });
});

// FB.8 — the held-out judge emits a per-axis one-line rationale ALONGSIDE its scores; the runner persists it
// into JudgeResult.axisRationales WHEN the model supplied all 5, omits it otherwise — and in BOTH cases the
// acceptance + axisScores are byte-identical to the no-rationale run (rule #6: the rationale explains the
// floor, it never moves it; acceptance stays runner-computed from axisScores × the immutable rubric weights).
const FULL_RATIONALES = {
  grounding: 'cites two prior-art sources',
  novelty: 'cross-domain transplant not seen in the surveyed space',
  feasibility: 'buildable with off-the-shelf parts',
  falsification_survival: 'survives the obvious counterexample',
  subtype_check_pass: 'meets the cross_domain_transfer subtype contract',
};

describe('runJudge — FB.8 per-axis rationale (explanatory output; acceptance unaffected, rule #6)', () => {
  test('test_fb8_persists_axis_rationales_when_complete', async () => {
    const runId = 'run-judge-fb8-complete';
    const judged = await runJudge({
      gateway: judgeGateway({ ...PER_AXIS_OUTPUT, rationales: FULL_RATIONALES }),
      store,
      candidate: validCandidateIdeaCrossDomain,
      runContext: runContext(runId),
    });
    // acceptance + scores UNCHANGED by the rationale (rule #6 — the score is still runner-computed).
    expect(judged?.acceptance).toBe(EXPECTED_ACCEPTANCE);
    expect(judged?.axisScores).toEqual(PER_AXIS_OUTPUT);
    // the rationale is persisted in the authoritative judge.reviewed payload.
    const reviewed = (await store.readByRun(runId)).find((r) => r.type === 'judge.reviewed');
    const parsed = JudgeResult.safeParse(reviewed?.payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.axisRationales).toEqual(FULL_RATIONALES);
      expect(parsed.data.acceptance).toBe(EXPECTED_ACCEPTANCE);
    }
  });

  test('test_fb8_omits_rationales_when_partial', async () => {
    // a partial rationale set (model dropped an axis) → the optional field is OMITTED (never a partial,
    // exhaustive-record rejection that would lose the score); acceptance + scores unchanged.
    const runId = 'run-judge-fb8-partial';
    const { subtype_check_pass: _drop, ...partial } = FULL_RATIONALES;
    void _drop;
    const judged = await runJudge({
      gateway: judgeGateway({ ...PER_AXIS_OUTPUT, rationales: partial }),
      store,
      candidate: validCandidateIdeaCrossDomain,
      runContext: runContext(runId),
    });
    expect(judged?.acceptance).toBe(EXPECTED_ACCEPTANCE);
    expect(judged?.axisRationales).toBeUndefined();
    const reviewed = (await store.readByRun(runId)).find((r) => r.type === 'judge.reviewed');
    expect(JudgeResult.safeParse(reviewed?.payload).success).toBe(true);
  });

  test('test_fb8_omits_rationales_when_absent', async () => {
    // no rationales at all (pre-FB.8 model) → axisRationales undefined; acceptance + scores byte-identical.
    const runId = 'run-judge-fb8-absent';
    const judged = await runJudge({
      gateway: judgeGateway(PER_AXIS_OUTPUT),
      store,
      candidate: validCandidateIdeaCrossDomain,
      runContext: runContext(runId),
    });
    expect(judged?.axisRationales).toBeUndefined();
    expect(judged?.acceptance).toBe(EXPECTED_ACCEPTANCE);
    expect(judged?.axisScores).toEqual(PER_AXIS_OUTPUT);
  });
});
