import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION, NoveltyScore, validateEventPayload } from '@doppl/contracts';
import type { RunEventEnvelope } from '@doppl/contracts';
import { createFakeGateway } from '../../../../src/model-gateway';
import type { ModelGateway } from '../../../../src/model-gateway';
import { cosineSimilarity, noveltyScoreOf } from '../../../../src/selection/novelty/cosine';
import { scoreNovelty } from '../../../../src/selection/novelty/score-novelty';
import type {
  NoveltyEmitter,
  ScoreNoveltyInput,
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

// Comparison vectors share the stub embedding dimension (8) so cosine never dimension-mismatches.
const baseInput: ScoreNoveltyInput = {
  runId: 'run_1',
  generationId: 'gen_1',
  candidateId: 'cand_1',
  summary: 'a candidate summary',
  comparison: [
    { candidateId: 'cand_2', vector: [0, 1, 0, 0, 0, 0, 0, 0] },
    { candidateId: 'cand_3', vector: [0, 0, 1, 0, 0, 0, 0, 0] },
  ],
};

/**
 * scoreNovelty — orchestrates the marker→embed→cosine→build→scored-emit flow (P5.2). Emits through
 * an injected NoveltyEmitter seam (I/O = frozen envelope minus server-assigned fields; real impl =
 * EventStore.append). Replay recomputes from the persisted vector with ZERO gateway calls (rule #7).
 */
describe('scoreNovelty — emit + persist authoritative vector', () => {
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
    const result = await scoreNovelty(baseInput, {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    expect(result.comparisonSet).toEqual(['cand_2', 'cand_3']);
    expect(result.method).toBe('cosine');
  });

  // 16 — KEY SAFETY RULE #7: recompute from the persisted vector yields the same score with ZERO gateway calls.
  test('REPLAY_recompute_uses_persisted_vector_no_gateway', async () => {
    const { emit } = recorder();
    const { gateway, calls } = countingGateway(createFakeGateway({ mode: 'valid' }));
    const result = await scoreNovelty(baseInput, { gateway, emit, newId: idFactory() });
    const afterLive = calls();
    const comparisonVectors = baseInput.comparison.map((c) => c.vector);
    const recomputed = noveltyScoreOf(result.vector, comparisonVectors);
    expect(recomputed).toBe(result.score);
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

  // 18 — spec(§8): the explanation is a real audit trail — for a non-empty set it names the
  // nearest-neighbour candidateId AND the comparison count; for the empty set it states the
  // zero-prior-candidates case (inclusion-based, not exact-format, so it isn't brittle).
  test('scored_explanation_enumerates_nearest_and_count', async () => {
    // Distinct comparison ids (no digit collision with the count) + non-tying vectors so the
    // nearest neighbour is unambiguous.
    const input: ScoreNoveltyInput = {
      runId: 'run_1',
      generationId: 'gen_1',
      candidateId: 'cand_1',
      summary: 'a candidate summary',
      comparison: [
        { candidateId: 'cand_alpha', vector: [0, 0, 0, 0, 0, 0, 0, 1] },
        { candidateId: 'cand_beta', vector: [1, 0, 0, 0, 0, 0, 0, 0] },
      ],
    };
    const { emit } = recorder();
    const result = await scoreNovelty(input, {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    const sims = input.comparison.map((c) => cosineSimilarity(result.vector, c.vector));
    let maxSim = -Infinity;
    let nearestId = '';
    for (const [i, c] of input.comparison.entries()) {
      const s = sims[i] ?? -Infinity;
      if (s > maxSim) {
        maxSim = s;
        nearestId = c.candidateId;
      }
    }
    expect(result.explanation).toContain(nearestId);
    expect(result.explanation).toContain(String(input.comparison.length));

    // Empty comparison set: the explanation states the zero-prior-candidates case.
    const { emit: emit2 } = recorder();
    const emptyResult = await scoreNovelty(
      { ...input, comparison: [] },
      { gateway: createFakeGateway({ mode: 'valid' }), emit: emit2, newId: idFactory() },
    );
    expect(emptyResult.explanation).toMatch(/no prior/i);
  });
});
