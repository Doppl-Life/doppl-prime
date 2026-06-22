import { describe, expect, it } from 'vitest';
import { validFitnessScore, validNoveltyScore } from '@doppl/contracts';
import type { RunEventEnvelope } from '@doppl/contracts';
import { deriveFitnessSeries, deriveGenerationComparison } from '../../../src/charts/chartData';
import { makeEvent } from '../../fixtures/events';

function fitnessEvent(
  sequence: number,
  generationId: string,
  total: number,
  components?: Record<string, number>,
): RunEventEnvelope {
  return makeEvent(sequence, 'fitness.scored', {
    generationId,
    candidateId: `cand_${sequence}`,
    payload: {
      ...validFitnessScore,
      candidateId: `cand_${sequence}`,
      total,
      ...(components ? { components } : {}),
    },
  });
}

function noveltyEvent(sequence: number, generationId: string, score: number): RunEventEnvelope {
  return makeEvent(sequence, 'novelty.scored', {
    generationId,
    candidateId: `cand_${sequence}`,
    payload: { ...validNoveltyScore, candidateId: `cand_${sequence}`, score },
  });
}

describe('chartData — pure event-derived chart series selectors', () => {
  // spec(REQ-E-001): deriveFitnessSeries extracts FitnessScore.total per generation, ordered by the
  // first-seen `sequence` (NOT generationId string-sort — ids are opaque) → replay-equivalent.
  it('test_deriveFitnessSeries_orders_by_generation', () => {
    const events = [
      fitnessEvent(5, 'gen_1', 0.6),
      fitnessEvent(2, 'gen_0', 0.4),
      fitnessEvent(8, 'gen_1', 0.7), // gen_1 best 0.7
      fitnessEvent(3, 'gen_0', 0.5), // gen_0 best 0.5
    ];
    const series = deriveFitnessSeries(events);
    // gen_0's first event is at sequence 2 → it precedes gen_1 (first at 5), regardless of array order.
    expect(series.map((p) => p.generationId)).toEqual(['gen_0', 'gen_1']);
    expect(series.map((p) => p.index)).toEqual([0, 1]);
    expect(series[0]!.best).toBe(0.5);
    expect(series[1]!.best).toBe(0.7);
    expect(series[0]!.mean).toBeCloseTo(0.45);
    expect(series[0]!.count).toBe(2);
  });

  // spec(§12): deriveGenerationComparison contrasts generations on best/mean fitness + best/mean novelty.
  it('test_deriveGenerationComparison_contrasts_metrics', () => {
    const events = [
      fitnessEvent(2, 'gen_0', 0.4),
      fitnessEvent(3, 'gen_0', 0.6),
      noveltyEvent(4, 'gen_0', 0.7),
      fitnessEvent(6, 'gen_1', 0.8),
      noveltyEvent(7, 'gen_1', 0.5),
      noveltyEvent(9, 'gen_1', 0.9),
    ];
    const cmp = deriveGenerationComparison(events);
    expect(cmp.map((p) => p.generationId)).toEqual(['gen_0', 'gen_1']);
    expect(cmp[0]).toMatchObject({
      bestFitness: 0.6,
      meanFitness: 0.5,
      fitnessCount: 2,
      bestNovelty: 0.7,
      noveltyCount: 1,
    });
    expect(cmp[1]).toMatchObject({ bestFitness: 0.8, bestNovelty: 0.9, noveltyCount: 2 });
  });

  // spec(§12 partial-data): zero events → empty series (no throw); one generation → a single point.
  it('test_selectors_zero_and_partial_data', () => {
    expect(deriveFitnessSeries([])).toEqual([]);
    expect(deriveGenerationComparison([])).toEqual([]);
    const one = deriveFitnessSeries([fitnessEvent(1, 'gen_0', 0.5)]);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ generationId: 'gen_0', index: 0, best: 0.5, count: 1 });
  });

  // spec(§4 / authoritative-once-computed): the series read FitnessScore.total / NoveltyScore.score
  // VERBATIM from the validated payload — never re-deriving fitness; a malformed payload is skipped.
  it('test_selectors_read_persisted_scores_no_recompute', () => {
    const ev = fitnessEvent(1, 'gen_0', 0.123456, { critic: 0.1 });
    const series = deriveFitnessSeries([ev]);
    expect(series[0]!.best).toBe(0.123456); // exact persisted value, not recomputed from components
    expect(series[0]!.components).toEqual({ critic: 0.1 });
    // a payload that fails the frozen FitnessScore schema is skipped (defensive), never crashes.
    const bad = makeEvent(2, 'fitness.scored', {
      generationId: 'gen_9',
      payload: { not: 'a-score' },
    });
    expect(deriveFitnessSeries([ev, bad]).map((p) => p.generationId)).toEqual(['gen_0']);
  });
});
