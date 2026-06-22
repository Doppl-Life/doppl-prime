import { CURRENT_SCHEMA_VERSION, CullingEvent } from '@doppl/contracts';
import type { AgenomeStatus, RunEventEnvelope } from '@doppl/contracts';

/**
 * cull (P5.7, ARCHITECTURE.md §8/§3) — culls weak lineages from the persisted FitnessScores and emits
 * one explainable `lineage.culled`.
 *
 * An agenome's lineage strength is its BEST scored candidate's `total`; an agenome is culled when that
 * best total falls below the injected `CullPolicy.minFitness` threshold. The decision is explainable
 * from the event alone (§8): `CullingEvent.scoreSnapshot` records each culled target's justifying score.
 * Because `lineage.culled` is NOT high-traffic, the append path's `validateEventPayload` falls to the
 * generic schema — so the producer (selection) validates `CullingEvent.parse` EXPLICITLY before emit.
 *
 * Boundaries: an agenome already `culled`/`spent`/`failed`, or with NO scored candidate (no fitness
 * basis — `Math.max(...[])` would mis-rank it), is SKIPPED (never culled). Nothing culled → no event
 * (the `CullingEvent.targetIds` ≥1 kernel rule is never violated). Pure compose + emit; no input
 * mutation; the agenome state transition + energy debit are the kernel's, not this function's.
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
  /** Cull an agenome whose best candidate total is strictly below this threshold. */
  minFitness: number;
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

export async function cull(
  input: CullInput,
  policy: CullPolicy,
  deps: CullDeps,
): Promise<CullResult> {
  const culledIds: string[] = [];
  const scoreSnapshot: Record<string, number> = {};
  for (const agenome of input.agenomes) {
    const best = bestTotal(agenome);
    if (best !== undefined && best < policy.minFitness) {
      culledIds.push(agenome.agenomeId);
      scoreSnapshot[agenome.agenomeId] = best;
    }
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
    reason: `best candidate fitness below cull threshold ${policy.minFitness}`,
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
