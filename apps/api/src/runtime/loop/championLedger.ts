import type { RunEventRow } from '../../event-store';
import { bestScoredSurvivor } from '../terminal/partialSummary';

/**
 * championLedger (Wave 1, Step 1 — "lock the peak candidate", ARCHITECTURE.md §8, KEY SAFETY RULE #7).
 *
 * The reigning CHAMPION is the cross-generation peak scored candidate "so far": the top-`total`
 * `fitness.scored` survivor whose lineage was NOT `lineage.culled` (§3 `selected = scored ∧ ¬culled`),
 * tie-broken by LOWEST `sequence`. It is the floor the generation loop carries forward so the per-generation
 * best can never REGRESS — fixing the genome-elitism re-roll (the carried elite re-generates a fresh
 * candidate each generation, so its score bounces and the peak is lost).
 *
 * PURE over the persisted log (no IO/clock/RNG): it composes the §3 `scoredSurvivors`/`bestScoredSurvivor`
 * projection (single-sourcing the cull-aware best-so-far logic) and resolves the champion's agenome + home
 * generation from its persisted `candidate.created` — so the carry decision is byte-identically re-derivable
 * on replay with NO provider call (rule #7) and NO fabricated event (rule #2).
 */
export interface ChampionEntry {
  /** The champion candidate's id (its locked `fitness.scored` is the carried floor). */
  readonly candidateId: string;
  /** The agenome that produced the champion (resolved from `candidate.created`) — eligible to keep breeding. */
  readonly agenomeId: string;
  /** The champion's persisted fitness total — read VERBATIM, never recomputed (rule #7). */
  readonly total: number;
  /** The champion's `fitness.scored` sequence (the tie-break key). */
  readonly sequence: number;
  /** The generation the champion was produced in (its candidate/score live there; never re-emitted). */
  readonly generationId: string;
}

/**
 * The reigning champion through the persisted log, or `null` when no scored survivor exists yet. Fails CLOSED
 * (returns null) when the best survivor has no `candidate.created` — a corrupt log never fabricates a champion.
 */
export function reigningChampion(log: readonly RunEventRow[]): ChampionEntry | null {
  const best = bestScoredSurvivor(log);
  if (best === null) return null;
  // Resolve the champion's agenome + home generation from its creation event (rule #7 — read the persisted
  // record, never recompute). A scored candidate that was never created is a corrupt log → fail closed.
  for (const row of log) {
    if (
      row.type === 'candidate.created' &&
      row.candidateId === best.candidateId &&
      row.agenomeId !== null &&
      row.generationId !== null
    ) {
      return {
        candidateId: best.candidateId,
        agenomeId: row.agenomeId,
        total: best.total,
        sequence: best.sequence,
        generationId: row.generationId,
      };
    }
  }
  return null;
}
