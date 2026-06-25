import { CURRENT_SCHEMA_VERSION, CullingEvent } from '@doppl/contracts';
import type { AgenomeStatus, RunEventEnvelope } from '@doppl/contracts';

/**
 * cull (P5.7, ARCHITECTURE.md §8/§3) — culls weak lineages from the persisted FitnessScores and emits
 * one explainable `lineage.culled`.
 *
 * RELATIVE threshold (the fix): an agenome's lineage strength is its BEST scored candidate's `total`; an
 * agenome is culled when that best total falls below `mean − k·stddev` of the generation's best-total
 * distribution (over the ELIGIBLE agenomes). This is relative to each generation's own fitness spread —
 * a fixed `minFitness:0` never fired (a total is ≥ 0), so the prior policy culled NOTHING and weak
 * lineages bred forever. A tight distribution (no clear outlier) culls nothing; only clearly-weak low
 * outliers are removed.
 *
 * POPULATION FLOOR (non-negotiable): the cull is CLAMPED so at least `CullPolicy.minSurvivors` eligible
 * agenomes always remain — the organism must survive to breed (fusion needs ≥2 eligible parents; this
 * complements the extinction-guard in `successor.ts`). When a relative cull would drop below the floor,
 * the weakest are culled FIRST and the top survivors are KEPT until exactly the floor is reached; with ≤
 * `minSurvivors` eligible agenomes nothing is culled at all.
 *
 * The decision is explainable from the event alone (§8): `CullingEvent.scoreSnapshot` records each culled
 * target's justifying best total + `reason` names the relative threshold. Because `lineage.culled` is NOT
 * high-traffic, the append path's `validateEventPayload` falls to the generic schema — so the producer
 * (selection) validates `CullingEvent.parse` EXPLICITLY before emit.
 *
 * DETERMINISTIC + replay-safe (rule #7): the decision derives ONLY from the persisted `total` values (mean,
 * stddev, weakest-first ordering with a canonical id tiebreak) — no randomness, no provider call — so replay
 * reconstructs the identical cull set. Boundaries: an agenome already `culled`/`spent`/`failed`, or with NO
 * scored candidate (no fitness basis — `Math.max(...[])` would mis-rank it), is SKIPPED (never eligible,
 * never counted in the distribution). Nothing culled → no event (the `CullingEvent.targetIds` ≥1 kernel
 * rule is never violated). Pure compose + emit; no input mutation; the agenome state transition + energy
 * debit are the kernel's, not this function's.
 */
export type CullEmitter = (
  envelope: Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>,
) => Promise<{ sequence: number }>;

export interface ScoredCandidate {
  candidateId: string;
  total: number;
}

export interface AgenomeFitness {
  agenomeId: string;
  status: AgenomeStatus;
  candidates: readonly ScoredCandidate[];
}

export interface CullInput {
  runId: string;
  generationId: string;
  agenomes: readonly AgenomeFitness[];
}

export interface CullPolicy {
  /**
   * The RELATIVE cull threshold's spread multiplier: an eligible agenome is culled when its best-candidate
   * total is strictly below `mean − relativeStdDevK·stddev` of the generation's best-total distribution.
   * Larger k → a more permissive cull (only deeper outliers). The threshold is relative to the generation,
   * so culling tracks each generation's own fitness spread rather than a fixed absolute floor.
   */
  relativeStdDevK: number;
  /**
   * The POPULATION FLOOR: the minimum number of eligible agenomes that must SURVIVE a cull. The cull is
   * clamped so the organism can still reproduce (fusion needs ≥2 eligible parents). With ≤ `minSurvivors`
   * eligible agenomes in the generation, nothing is culled. Should be ≥ 2.
   */
  minSurvivors: number;
  /**
   * TRUNCATION pressure (steady selection): each generation cull AT LEAST `floor(eligible · cullFraction)` of
   * the WEAKEST lineages — even when the distribution is tight and no relative outlier clears `mean − k·stddev`
   * — so weak lineages reliably die every generation and the population converges toward a winner. The cull
   * removes the weakest `max(belowThreshold, truncationQuota)`, always clamped to the `minSurvivors` floor and
   * weakest-first (canonical id tiebreak → deterministic, replay-safe rule #7). Optional; omit / 0 ⇒ pure
   * relative-threshold culling (the prior behaviour, which a tight distribution never triggered).
   */
  cullFraction?: number;
}

export interface CullDeps {
  emit: CullEmitter;
  newId: () => string;
}

export interface CullResult {
  culledIds: string[];
  cullingEvent: CullingEvent | undefined;
}

const TERMINAL_STATES: ReadonlySet<AgenomeStatus> = new Set(['culled', 'spent', 'failed']);

/** An agenome is cull-eligible only if it is not terminal AND has ≥1 scored candidate (a fitness basis). */
function bestTotal(agenome: AgenomeFitness): number | undefined {
  if (TERMINAL_STATES.has(agenome.status) || agenome.candidates.length === 0) {
    return undefined;
  }
  return Math.max(...agenome.candidates.map((c) => c.total));
}

/** An eligible agenome paired with its best-candidate total (the lineage-strength basis). */
interface EligibleAgenome {
  agenomeId: string;
  best: number;
}

export async function cull(
  input: CullInput,
  policy: CullPolicy,
  deps: CullDeps,
): Promise<CullResult> {
  // Eligible set = non-terminal agenomes with a scored candidate (the distribution + cull operate over it).
  const eligible: EligibleAgenome[] = [];
  for (const agenome of input.agenomes) {
    const best = bestTotal(agenome);
    if (best !== undefined) eligible.push({ agenomeId: agenome.agenomeId, best });
  }

  // POPULATION FLOOR: with ≤ minSurvivors eligible, no cull is possible without dropping below the
  // reproduce floor — bail before computing the distribution.
  if (eligible.length <= policy.minSurvivors) {
    return { culledIds: [], cullingEvent: undefined };
  }

  // Relative threshold = mean − k·stddev of the best-total distribution (population stddev — the eligible
  // set IS the whole generation, not a sample). Deterministic over the persisted totals (rule #7).
  const n = eligible.length;
  const mean = eligible.reduce((sum, e) => sum + e.best, 0) / n;
  const variance = eligible.reduce((sum, e) => sum + (e.best - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const threshold = mean - policy.relativeStdDevK * stddev;

  // WEAKEST-FIRST ordering (ascending best; canonical id tiebreak) — the cull always removes a PREFIX of
  // this, so the floor clamp keeps the strongest survivors and the decision is deterministic (rule #7).
  const weakestFirst = eligible
    .slice()
    .sort((a, b) =>
      a.best !== b.best
        ? a.best - b.best
        : a.agenomeId < b.agenomeId
          ? -1
          : a.agenomeId > b.agenomeId
            ? 1
            : 0,
    );

  // RELATIVE: how many are STRICTLY below mean − k·stddev (a prefix of weakestFirst since it's sorted).
  const belowThresholdCount = weakestFirst.filter((e) => e.best < threshold).length;

  // TRUNCATION: steady pressure — cull at least floor(n · cullFraction) of the weakest each generation,
  // so a tight (no-outlier) distribution still loses its weakest lineages and the population converges.
  const truncationQuota = Math.floor(n * (policy.cullFraction ?? 0));

  // FLOOR CLAMP: never cull so many that fewer than minSurvivors eligible remain. Cull the weakest
  // max(relative, truncation), clamped to (eligible − minSurvivors).
  const maxCullable = Math.max(0, n - policy.minSurvivors);
  const cullCount = Math.min(maxCullable, Math.max(belowThresholdCount, truncationQuota));
  const toCull = weakestFirst.slice(0, cullCount);

  const culledIds: string[] = [];
  const scoreSnapshot: Record<string, number> = {};
  for (const e of toCull) {
    culledIds.push(e.agenomeId);
    scoreSnapshot[e.agenomeId] = e.best;
  }

  // Nothing culled → no event (never an empty-targets CullingEvent — the ≥1 kernel rule).
  if (culledIds.length === 0) {
    return { culledIds, cullingEvent: undefined };
  }

  const cullingEvent = CullingEvent.parse({
    id: deps.newId(),
    runId: input.runId,
    generationId: input.generationId,
    targetIds: culledIds,
    reason:
      `weakest ${cullCount} of ${n} eligible lineages culled — below the relative threshold ${threshold} ` +
      `(generation mean ${mean} − ${policy.relativeStdDevK}·stddev ${stddev}) and/or the truncation quota ` +
      `(cullFraction ${policy.cullFraction ?? 0}); floor ${policy.minSurvivors} eligible survivors preserved`,
    scoreSnapshot,
  });

  await deps.emit({
    runId: input.runId,
    generationId: input.generationId,
    id: deps.newId(),
    type: 'lineage.culled',
    actor: 'selection_controller',
    payload: cullingEvent,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  return { culledIds, cullingEvent };
}
