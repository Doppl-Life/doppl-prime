import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION, NoveltyScore, validateEventPayload } from '@doppl/contracts';
import type { RunEventEnvelope } from '@doppl/contracts';
import { createFakeGateway } from '../../../../src/model-gateway';
import type { ModelGateway } from '../../../../src/model-gateway';
import { cosineSimilarity, noveltyScoreOf } from '../../../../src/selection/novelty/cosine';
import { lexicalNoveltyScore } from '../../../../src/selection/novelty/lexical-fallback';
import { scoreNovelty } from '../../../../src/selection/novelty/score-novelty';
import type {
  NoveltyEmitter,
  ScoreNoveltyInput,
  ScoreNoveltyResult,
} from '../../../../src/selection/novelty/score-novelty';

type Emitted = Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>;

function recorder(): { emit: NoveltyEmitter; events: Emitted[] } {
  const events: Emitted[] = [];
  let seq = 0;
  const emit: NoveltyEmitter = (env) => {
    events.push(env);
    return Promise.resolve({ sequence: seq++ });
  };
  return { emit, events };
}

function idFactory(): () => string {
  let n = 0;
  return () => `evt_${n++}`;
}

function countingGateway(base: ModelGateway): { gateway: ModelGateway; calls: () => number } {
  let calls = 0;
  return {
    gateway: {
      call: (req) => {
        calls += 1;
        return base.call(req);
      },
      capabilityFor: base.capabilityFor,
    },
    calls: () => calls,
  };
}

/** Narrow a result to the happy (non-degraded) path or fail loudly — the happy-path regression guard. */
function happyScore(result: ScoreNoveltyResult): NoveltyScore {
  if (result.degraded) {
    throw new Error('expected a non-degraded (happy-path) result');
  }
  return result.noveltyScore;
}

// Comparison vectors share the stub embedding dimension (8) so cosine never dimension-mismatches; each
// carries a summary (used by the lexical degrade path, ignored on the cosine happy path).
const baseInput: ScoreNoveltyInput = {
  runId: 'run_1',
  generationId: 'gen_1',
  candidateId: 'cand_1',
  summary: 'a candidate summary',
  comparison: [
    { candidateId: 'cand_2', vector: [0, 1, 0, 0, 0, 0, 0, 0], summary: 'beta gamma' },
    { candidateId: 'cand_3', vector: [0, 0, 1, 0, 0, 0, 0, 0], summary: 'gamma delta' },
  ],
};

// Triggers the degrade path (gateway reject mode) — summaries are disjoint from the candidate summary,
// so the lexical estimate is a non-zero novelty.
const degradeInput: ScoreNoveltyInput = {
  runId: 'run_1',
  generationId: 'gen_1',
  candidateId: 'cand_1',
  summary: 'alpha beta gamma',
  comparison: [
    { candidateId: 'cand_2', vector: [0, 1, 0, 0, 0, 0, 0, 0], summary: 'delta epsilon zeta' },
  ],
};

/**
 * scoreNovelty — orchestrates the marker→embed→cosine→build→scored-emit flow (P5.2), now with the
 * P5.3 degrade path: on embed failure it falls back to the deterministic lexical method and emits
 * `novelty_scoring_degraded` instead of `novelty.scored`, returning a discriminated result.
 */
describe('scoreNovelty — emit + persist authoritative vector (happy path)', () => {
  // 11 — spec(§4): the operation-start marker is emitted before the scored event (in-flight observability).
  test('emits_scoring_started_then_scored_in_order', async () => {
    const { emit, events } = recorder();
    await scoreNovelty(baseInput, {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    expect(events.map((e) => e.type)).toEqual(['novelty.scoring_started', 'novelty.scored']);
  });

  // 12 — spec(§8): exactly one novelty.scored per candidate (single authoritative novelty home).
  test('emits_exactly_one_scored_per_candidate', async () => {
    const { emit, events } = recorder();
    await scoreNovelty(baseInput, {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    expect(events.filter((e) => e.type === 'novelty.scored')).toHaveLength(1);
  });

  // 13 — spec(§4)/spec(§9): the scored payload passes validateEventPayload + parses against frozen NoveltyScore.
  test('scored_payload_validates_against_NoveltyScore', async () => {
    const { emit, events } = recorder();
    await scoreNovelty(baseInput, {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    const scored = events.find((e) => e.type === 'novelty.scored');
    expect(scored).toBeDefined();
    const result = validateEventPayload('novelty.scored', scored!.payload);
    expect(result.ok).toBe(true);
    expect(() => NoveltyScore.parse(scored!.payload)).not.toThrow();
  });

  // 14 — spec(§4): both envelopes carry actor selection_controller + current schemaVersion + candidate ids.
  test('emitted_envelopes_actor_is_selection_controller', async () => {
    const { emit, events } = recorder();
    await scoreNovelty(baseInput, {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.actor).toBe('selection_controller');
      expect(e.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(e.runId).toBe('run_1');
      expect(e.generationId).toBe('gen_1');
      expect(e.candidateId).toBe('cand_1');
    }
  });

  // 15 — spec(§8): the NoveltyScore records the comparison candidateIds + method 'cosine' (auditable).
  test('records_comparisonSet_and_method', async () => {
    const { emit } = recorder();
    const score = happyScore(
      await scoreNovelty(baseInput, {
        gateway: createFakeGateway({ mode: 'valid' }),
        emit,
        newId: idFactory(),
      }),
    );
    expect(score.comparisonSet).toEqual(['cand_2', 'cand_3']);
    expect(score.method).toBe('cosine');
  });

  // 16 — KEY SAFETY RULE #7: recompute from the persisted vector yields the same score with ZERO gateway calls.
  test('REPLAY_recompute_uses_persisted_vector_no_gateway', async () => {
    const { emit } = recorder();
    const { gateway, calls } = countingGateway(createFakeGateway({ mode: 'valid' }));
    const result = await scoreNovelty(baseInput, { gateway, emit, newId: idFactory() });
    const afterLive = calls();
    const score = happyScore(result);
    const comparisonVectors = baseInput.comparison.map((c) => c.vector);
    const recomputed = noveltyScoreOf(score.vector, comparisonVectors);
    expect(recomputed).toBe(score.score);
    expect(calls() - afterLive).toBe(0);
  });

  // 17 — KEY SAFETY RULE #8: neither emitted event is energy.spent (markers debit no energy).
  test('neither_event_is_energy_spent', async () => {
    const { emit, events } = recorder();
    await scoreNovelty(baseInput, {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    expect(events.map((e) => e.type)).toEqual(['novelty.scoring_started', 'novelty.scored']);
    expect(events.some((e) => e.type === 'energy.spent')).toBe(false);
  });

  // 18 — spec(§8): the explanation is a real audit trail — names the nearest-neighbour candidateId AND
  // the comparison count for a non-empty set; states the zero-prior-candidates case for the empty set.
  test('scored_explanation_enumerates_nearest_and_count', async () => {
    const input: ScoreNoveltyInput = {
      runId: 'run_1',
      generationId: 'gen_1',
      candidateId: 'cand_1',
      summary: 'a candidate summary',
      comparison: [
        { candidateId: 'cand_alpha', vector: [0, 0, 0, 0, 0, 0, 0, 1], summary: 'x' },
        { candidateId: 'cand_beta', vector: [1, 0, 0, 0, 0, 0, 0, 0], summary: 'y' },
      ],
    };
    const { emit } = recorder();
    const score = happyScore(
      await scoreNovelty(input, {
        gateway: createFakeGateway({ mode: 'valid' }),
        emit,
        newId: idFactory(),
      }),
    );
    const sims = input.comparison.map((c) => cosineSimilarity(score.vector, c.vector));
    let maxSim = -Infinity;
    let nearestId = '';
    for (const [i, c] of input.comparison.entries()) {
      const s = sims[i] ?? -Infinity;
      if (s > maxSim) {
        maxSim = s;
        nearestId = c.candidateId;
      }
    }
    expect(score.explanation).toContain(nearestId);
    expect(score.explanation).toContain(String(input.comparison.length));

    const { emit: emit2 } = recorder();
    const emptyScore = happyScore(
      await scoreNovelty(
        { ...input, comparison: [] },
        { gateway: createFakeGateway({ mode: 'valid' }), emit: emit2, newId: idFactory() },
      ),
    );
    expect(emptyScore.explanation).toMatch(/no prior/i);
  });
});

/**
 * P5.3 degrade path — on embed failure, fall back to the deterministic lexical method, emit
 * `novelty_scoring_degraded` (never blocking, never silent-zeroing), replay-faithful.
 */
describe('scoreNovelty — novelty degrade path (P5.3)', () => {
  // 5 — spec(§5): embed failure → degraded result returned, no throw, scoring not blocked.
  test('degrade_on_embed_failure_returns_degraded_no_throw', async () => {
    const { emit } = recorder();
    const result = await scoreNovelty(degradeInput, {
      gateway: createFakeGateway({ mode: 'reject' }),
      emit,
      newId: idFactory(),
    });
    expect(result.degraded).toBe(true);
  });

  // 6 — spec(§8)/spec(§4): the degrade path emits exactly [novelty.scoring_started,
  // novelty_scoring_degraded] in order — the started marker fires on BOTH terminal paths (pinned so a
  // future change can't silently drop it on degrade); one degraded, zero novelty.scored (at-most-once, Q1).
  test('degrade_emits_one_degraded_no_scored', async () => {
    const { emit, events } = recorder();
    await scoreNovelty(degradeInput, {
      gateway: createFakeGateway({ mode: 'reject' }),
      emit,
      newId: idFactory(),
    });
    expect(events.map((e) => e.type)).toEqual([
      'novelty.scoring_started',
      'novelty_scoring_degraded',
    ]);
    expect(events.filter((e) => e.type === 'novelty.scored')).toHaveLength(0);
  });

  // 7 — spec(§8): the degraded payload carries reason, method (≠ cosine), estimatedScore, candidateId.
  test('degrade_event_carries_reason_method_estimate', async () => {
    const { emit, events } = recorder();
    await scoreNovelty(degradeInput, {
      gateway: createFakeGateway({ mode: 'reject' }),
      emit,
      newId: idFactory(),
    });
    const degraded = events.find((e) => e.type === 'novelty_scoring_degraded');
    expect(degraded).toBeDefined();
    const payload = degraded!.payload;
    expect(typeof payload.reason).toBe('string');
    expect(payload.method).not.toBe('cosine');
    expect(typeof payload.estimatedScore).toBe('number');
    expect(payload.candidateId).toBe('cand_1');
  });

  // 8 — spec(§8): the estimate is the lexical value, NOT a silent 0 (flagged estimated, not zeroed).
  test('degrade_estimate_not_silently_zeroed', async () => {
    const { emit } = recorder();
    const result = await scoreNovelty(degradeInput, {
      gateway: createFakeGateway({ mode: 'reject' }),
      emit,
      newId: idFactory(),
    });
    const expected = lexicalNoveltyScore(
      degradeInput.summary,
      degradeInput.comparison.map((c) => c.summary),
    );
    expect(result.degraded).toBe(true);
    if (result.degraded) {
      expect(result.estimatedScore).toBe(expected);
      expect(result.estimatedScore).toBeGreaterThan(0);
    }
  });

  // 9 — KEY SAFETY RULE #7: lexical recompute from persisted summaries reproduces the value with ZERO
  // gateway calls on the lexical path (the failed embed attempt is the only gateway call).
  test('degrade_replay_deterministic_zero_gateway_after_failure', async () => {
    const { emit } = recorder();
    const { gateway, calls } = countingGateway(createFakeGateway({ mode: 'reject' }));
    const result = await scoreNovelty(degradeInput, { gateway, emit, newId: idFactory() });
    const afterFail = calls();
    const recomputed = lexicalNoveltyScore(
      degradeInput.summary,
      degradeInput.comparison.map((c) => c.summary),
    );
    expect(result.degraded).toBe(true);
    if (result.degraded) {
      expect(recomputed).toBe(result.estimatedScore);
    }
    expect(calls() - afterFail).toBe(0);
  });

  // 10 — regression guard: embed ok → marker→novelty.scored, NO novelty_scoring_degraded.
  test('happy_path_unchanged_no_degraded', async () => {
    const { emit, events } = recorder();
    await scoreNovelty(baseInput, {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    expect(events.map((e) => e.type)).toEqual(['novelty.scoring_started', 'novelty.scored']);
    expect(events.some((e) => e.type === 'novelty_scoring_degraded')).toBe(false);
  });
});
