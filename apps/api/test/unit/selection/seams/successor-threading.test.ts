import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  validAgenome,
  validCandidateIdeaCrossDomain,
  validFitnessScore,
} from '@doppl/contracts';
import type { Agenome } from '@doppl/contracts';
import type { RunEventRow } from '../../../../src/event-store';
import { rankEligibleByFitness } from '../../../../src/selection/seams/successor-threading';

/**
 * JUDGE-KEYED ANTI-REGRESSION (Phase A / breakthrough #6) — elitism must carry the genome the HELD-OUT JUDGE
 * rewards, not the one with the highest blended `total` (~31% agent-visible). So `rankEligibleByFitness` ranks
 * by the persisted `components.judge_acceptance` (the un-hackable signal, rule #6), falling back to `total`
 * only when a candidate has no judge component (degrade path). Pure over the persisted log (rule #7).
 * See docs/planning/coevolution-climb-plan.md §7-A2.
 */
const GEN = 'run-gen0';

function agenome(id: string): Agenome {
  return { ...validAgenome, id, generationId: GEN };
}
function created(candidateId: string, agenomeId: string): RunEventRow {
  return {
    type: 'candidate.created',
    generationId: GEN,
    candidateId,
    agenomeId,
    payload: {
      ...validCandidateIdeaCrossDomain,
      id: candidateId,
      generationId: GEN,
      agenomeId,
      status: 'created',
    },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  } as unknown as RunEventRow;
}
function scored(
  candidateId: string,
  total: number,
  components: Record<string, number>,
): RunEventRow {
  return {
    type: 'fitness.scored',
    generationId: GEN,
    candidateId,
    payload: { ...validFitnessScore, candidateId, total, components },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  } as unknown as RunEventRow;
}

describe('rankEligibleByFitness — judge-keyed elitism (#6)', () => {
  it('ranks the HIGHER-JUDGE genome first even when its total is LOWER (the decoy guard)', () => {
    // decoy: high total (critic/novelty inflated) but low judge. honest: lower total, higher judge.
    const decoy = agenome('agn_decoy');
    const honest = agenome('agn_honest');
    const log: RunEventRow[] = [
      created('c_decoy', 'agn_decoy'),
      scored('c_decoy', 0.7, { judge_acceptance: 0.3, novelty: 0.9 }),
      created('c_honest', 'agn_honest'),
      scored('c_honest', 0.6, { judge_acceptance: 0.5, novelty: 0.2 }),
    ];
    const ranked = rankEligibleByFitness([decoy, honest], GEN, log);
    expect(ranked.map((a) => a.id)).toEqual(['agn_honest', 'agn_decoy']); // judge wins over total
  });

  it('falls back to total when a candidate has no judge_acceptance component (degrade path)', () => {
    const hi = agenome('agn_hi');
    const lo = agenome('agn_lo');
    const log: RunEventRow[] = [
      created('c_hi', 'agn_hi'),
      scored('c_hi', 0.7, { novelty: 0.5 }), // no judge component → total is the key
      created('c_lo', 'agn_lo'),
      scored('c_lo', 0.4, { novelty: 0.5 }),
    ];
    const ranked = rankEligibleByFitness([hi, lo], GEN, log);
    expect(ranked.map((a) => a.id)).toEqual(['agn_hi', 'agn_lo']); // total ordering preserved
  });

  it('drops a parent with no scored candidate this generation (never an elite)', () => {
    const scoredParent = agenome('agn_s');
    const unscored = agenome('agn_u');
    const log: RunEventRow[] = [
      created('c_s', 'agn_s'),
      scored('c_s', 0.5, { judge_acceptance: 0.5 }),
    ];
    const ranked = rankEligibleByFitness([scoredParent, unscored], GEN, log);
    expect(ranked.map((a) => a.id)).toEqual(['agn_s']);
  });
});
