import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, validFitnessScore } from '@doppl/contracts';
import type { RunEventRow } from '../../../../src/event-store';
import {
  adaptiveMutationFraction,
  isFitnessImproving,
  isJudgeAcceptanceImproving,
  judgeImprovingFromLog,
  noveltySpread,
  DEFAULT_ADAPTIVE_PARAMS,
} from '../../../../src/selection/reproduction/convergence';

describe('convergence (experiment, fitness-aware adaptive controller / E3)', () => {
  it('noveltySpread: identical vectors → 0, orthogonal → ~1, <2 vectors → 0', () => {
    expect(noveltySpread([[1, 0, 0]])).toBe(0);
    expect(noveltySpread([])).toBe(0);
    expect(
      noveltySpread([
        [1, 0],
        [1, 0],
      ]),
    ).toBeCloseTo(0, 5);
    expect(
      noveltySpread([
        [1, 0],
        [0, 1],
      ]),
    ).toBeCloseTo(1, 5);
  });

  it('exploits (low mutation) when fitness is improving, explores (high mutation) when stuck', () => {
    const healthySpread = DEFAULT_ADAPTIVE_PARAMS.diversityFloor + 0.1; // above the collapse floor
    expect(adaptiveMutationFraction(healthySpread, true)).toBeCloseTo(
      DEFAULT_ADAPTIVE_PARAMS.exploitFraction,
      5,
    );
    expect(adaptiveMutationFraction(healthySpread, false)).toBeCloseTo(
      DEFAULT_ADAPTIVE_PARAMS.exploreFraction,
      5,
    );
    // exploit < explore (winning → converge onto the lineage; stuck → diversify)
    expect(adaptiveMutationFraction(healthySpread, true)).toBeLessThan(
      adaptiveMutationFraction(healthySpread, false),
    );
  });

  it('forces a recovery burst when the population collapses below the diversity floor — even while exploiting', () => {
    const collapsed = DEFAULT_ADAPTIVE_PARAMS.diversityFloor - 0.05;
    // even when "improving" (which would normally exploit/converge), a collapse forces recovery mutation.
    expect(adaptiveMutationFraction(collapsed, true)).toBeGreaterThanOrEqual(
      DEFAULT_ADAPTIVE_PARAMS.recoveryFraction,
    );
  });

  it('isFitnessImproving: true only when the current gen best exceeds the prior by > epsilon', () => {
    const best = new Map<number, number>([
      [0, 0.6],
      [1, 0.75],
      [2, 0.751],
    ]);
    const eps = 0.005;
    expect(isFitnessImproving(best, 1, eps)).toBe(true); // 0.75 > 0.6 + eps
    expect(isFitnessImproving(best, 2, eps)).toBe(false); // 0.751 ≈ 0.75 (within eps) → stuck
    expect(isFitnessImproving(best, 0, eps)).toBe(false); // no prior gen → explore by default
  });
});

// HONEST GATE (Phase A / breakthrough #3) — the explore→exploit switch must read the held-out judge
// component (the un-hackable signal) over a WINDOW, not the blended `total` (~31% agent-visible). See
// docs/planning/coevolution-climb-plan.md §3.3/§7-A1.
describe('honest gate — judge-acceptance windowed exploit trigger', () => {
  const eps = 0.005;

  it('isJudgeAcceptanceImproving: true only when the current gen best beats the prior WINDOW best by > epsilon', () => {
    const best = new Map<number, number>([
      [0, 0.4],
      [1, 0.5],
    ]);
    expect(isJudgeAcceptanceImproving(best, 1, eps, 2)).toBe(true); // 0.5 > 0.4 + eps
    expect(isJudgeAcceptanceImproving(best, 0, eps, 2)).toBe(false); // no prior → explore by default
    expect(isJudgeAcceptanceImproving(new Map([[3, 0.6]]), 3, eps, 2)).toBe(false); // no prior in window
  });

  it('the WINDOW is robust to a single-gen judge dip — re-attaining a prior peak is NOT improvement', () => {
    // 0.6 (peak) → 0.5 (dip) → 0.6 (recovery). A single-step check would call gen 2 "improving" (0.6 > 0.5);
    // the 2-gen window remembers the prior 0.6 peak, so merely recovering to it is NOT a climb.
    const dipped = new Map<number, number>([
      [0, 0.6],
      [1, 0.5],
      [2, 0.6],
    ]);
    expect(isJudgeAcceptanceImproving(dipped, 2, eps, 2)).toBe(false); // window remembers the 0.6 peak
    expect(isJudgeAcceptanceImproving(dipped, 2, eps, 1)).toBe(true); // single-step is fooled by the dip
  });

  // Build a minimal valid persisted log: generation.started{index} markers + fitness.scored rows carrying
  // a `components.judge_acceptance` (and a `total`). `judgeImprovingFromLog` folds it like the seam does.
  function genStarted(generationId: string, index: number): RunEventRow {
    return {
      type: 'generation.started',
      generationId,
      candidateId: null,
      payload: { index },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    } as unknown as RunEventRow;
  }
  function fitnessRow(
    generationId: string,
    total: number,
    components: Record<string, number>,
  ): RunEventRow {
    return {
      type: 'fitness.scored',
      generationId,
      candidateId: `${generationId}-c`,
      payload: { ...validFitnessScore, total, components },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    } as unknown as RunEventRow;
  }

  it('judgeImprovingFromLog: reads the judge component — total rising on a FLAT judge does NOT exploit (the decoy-peak guard)', () => {
    // gen0 judge 0.40, gen1 judge 0.40 (flat) but total jumps (agent-visible critic/novelty inflation).
    const log: RunEventRow[] = [
      genStarted('run-gen0', 0),
      fitnessRow('run-gen0', 0.52, { judge_acceptance: 0.4, novelty: 0.3 }),
      genStarted('run-gen1', 1),
      fitnessRow('run-gen1', 0.62, { judge_acceptance: 0.4, novelty: 0.9 }), // total↑, judge flat
    ];
    // honest gate: the judge didn't move → NOT improving → the controller keeps exploring (no decoy lock-in).
    expect(judgeImprovingFromLog(log, 'run-gen1', DEFAULT_ADAPTIVE_PARAMS)).toBe(false);
  });

  it('judgeImprovingFromLog: a genuine judge rise over the window DOES exploit', () => {
    const log: RunEventRow[] = [
      genStarted('run-gen0', 0),
      fitnessRow('run-gen0', 0.5, { judge_acceptance: 0.4 }),
      genStarted('run-gen1', 1),
      fitnessRow('run-gen1', 0.55, { judge_acceptance: 0.5 }), // judge genuinely up
    ];
    expect(judgeImprovingFromLog(log, 'run-gen1', DEFAULT_ADAPTIVE_PARAMS)).toBe(true);
  });

  it('judgeImprovingFromLog: returns null when NO judge component exists anywhere (caller falls back to total)', () => {
    const log: RunEventRow[] = [
      genStarted('run-gen0', 0),
      fitnessRow('run-gen0', 0.5, { novelty: 0.3 }), // no judge_acceptance key
      genStarted('run-gen1', 1),
      fitnessRow('run-gen1', 0.6, { novelty: 0.4 }),
    ];
    expect(judgeImprovingFromLog(log, 'run-gen1', DEFAULT_ADAPTIVE_PARAMS)).toBeNull();
  });
});
