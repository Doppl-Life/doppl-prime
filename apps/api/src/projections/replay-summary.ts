import { buildCurrentState, type CurrentState } from './current-state';
import type { RunEventRow } from './projection-builder';

/**
 * Replay-summary projection (ARCHITECTURE.md §16/§9, KEY SAFETY RULE #7). A seed-to-summary projection
 * built PURELY from the persisted, ordered run_events — ZERO model / web / embedding calls.
 *
 * Replay IS the same fold as the live current-state (P6.2 `buildCurrentState`, over P6.1's
 * `buildProjection`): re-folding the persisted log reconstructs the captured projection
 * (state-equivalence, asserted via the L27 `canonicalize`). The persisted-value READ-BACK is what makes
 * re-folding safe — RNG outcomes (reproduction/cull payloads), embedding vectors (novelty.scored), and
 * retrieval/web results are all read from their originating events, never re-sampled / re-embedded /
 * re-called. This module imports no provider and draws no randomness (no Math.random) and makes no web
 * call (no fetch) — the rule-#7 surface (pinned structurally + behaviorally).
 */

export interface ReplayDigest {
  /** The run's scenario seed, read from `run.configured` (null if absent). */
  seed: string | null;
  /** Number of generations folded. */
  generationCount: number;
  /** The final selected candidate's id (status 'selected'), or null. */
  selectedCandidateId: string | null;
  /** Fitness totals in sequence order (the fitness-over-time digest). */
  fitnessOverTime: number[];
}

export interface ReplaySummary {
  runId: string;
  sequenceThrough: number;
  /** The replayed current-state (state-equivalent to the captured projection). */
  state: CurrentState;
  digest: ReplayDigest;
}

/**
 * Build the replay summary from a run's persisted, ordered events. Re-folds the log via
 * `buildCurrentState` (which gates `schemaVersion ≤ current` and reads persisted RNG/embedding outcomes
 * back from their events) and computes a pure seed-to-outcome digest on top. No provider is called.
 */
export function buildReplaySummary(events: readonly RunEventRow[]): ReplaySummary {
  const projection = buildCurrentState(events);
  return {
    runId: projection.runId,
    sequenceThrough: projection.sequenceThrough,
    state: projection.state,
    digest: {
      seed: readSeed(events),
      generationCount: Object.keys(projection.state.generations).length,
      selectedCandidateId: findSelectedCandidate(projection.state),
      fitnessOverTime: readFitnessOverTime(events),
    },
  };
}

function plainObject(payload: unknown): Record<string, unknown> | null {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

/** The run's seed, read verbatim from the persisted `run.configured` payload. */
function readSeed(events: readonly RunEventRow[]): string | null {
  for (const event of events) {
    if (event.type !== 'run.configured') continue;
    const seed = plainObject(event.payload)?.seed;
    if (typeof seed === 'string' && seed.length > 0) return seed;
  }
  return null;
}

function findSelectedCandidate(state: CurrentState): string | null {
  for (const candidate of Object.values(state.candidateIdeas)) {
    if (candidate.status === 'selected') return candidate.id;
  }
  return null;
}

/** Fitness totals read verbatim from the persisted `fitness.scored` payloads, in sequence order. */
function readFitnessOverTime(events: readonly RunEventRow[]): number[] {
  const totals: number[] = [];
  for (const event of events) {
    if (event.type !== 'fitness.scored') continue;
    const total = plainObject(event.payload)?.total;
    if (typeof total === 'number') totals.push(total);
  }
  return totals;
}
