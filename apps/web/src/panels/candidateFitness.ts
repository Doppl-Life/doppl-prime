import { FitnessScore } from '../data/contracts';
import type { RunEventEnvelope } from '../data/contracts';

/**
 * candidateFitness (FV.5a) — the per-candidate fitness breakdown (total + components), the score detail
 * that LEFT the lineage graph when the `score` nodes were decluttered. PURE over `fitness.scored`
 * events: parses each through the FROZEN `FitnessScore` and reads `total`/`components` VERBATIM — the
 * dashboard NEVER recomputes a score (scoring is authoritative, §8 / rule #6 emit-only). Highest
 * `sequence` wins (the latest score for the candidate); null if none. Mirrors finalIdeaData.winnerFitness.
 */
export interface CandidateFitness {
  readonly total: number;
  readonly components: Readonly<Record<string, number>>;
}

export function candidateFitness(
  events: readonly RunEventEnvelope[],
  candidateId: string,
): CandidateFitness | null {
  let found: CandidateFitness | null = null;
  for (const e of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (e.type !== 'fitness.scored') continue;
    const parsed = FitnessScore.safeParse(e.payload);
    if (!parsed.success || parsed.data.candidateId !== candidateId) continue;
    found = { total: parsed.data.total, components: parsed.data.components }; // highest-sequence wins
  }
  return found;
}
