import type {
  AgenomeStatus,
  CandidateIdea,
  CheckResult,
  CriticReview,
  FitnessScore,
  GenerationStatus,
  JudgeResult,
  NoveltyScore,
  RunStatus,
} from '@doppl/contracts';

/**
 * The current-state shape (ARCHITECTURE.md §9) — a typed, per-entity record keyed by id. Keying by id
 * + SET (never append/increment) makes idempotent re-fold structural (re-applying an event sets the
 * same key). The high-traffic entity rows hold the frozen payload model VERBATIM (validated at the
 * append boundary, P0.10); the lifecycle rows (run/generation/agenome) carry id + identity + the
 * status derived from the event→status transition map (frozen status enums).
 *
 * This is an apps/api-INTERNAL read shape, not an Appendix-A contract — consumed by the P6.7 read
 * endpoints + P6.8 health. It is DERIVED + rebuildable (never authoritative, rule #2).
 */

export interface RunRow {
  id: string;
  status: RunStatus;
}

export interface GenerationRow {
  id: string;
  runId: string;
  status: GenerationStatus;
}

export interface AgenomeRow {
  id: string;
  runId: string;
  generationId: string | null;
  status: AgenomeStatus;
}

export interface LineageEdgeRow {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface CurrentState {
  runs: Record<string, RunRow>;
  generations: Record<string, GenerationRow>;
  agenomes: Record<string, AgenomeRow>;
  candidateIdeas: Record<string, CandidateIdea>;
  criticReviews: Record<string, CriticReview>;
  checkResults: Record<string, CheckResult>;
  noveltyScores: Record<string, NoveltyScore>;
  fitnessScores: Record<string, FitnessScore>;
  judgeResults: Record<string, JudgeResult>;
  lineageEdges: Record<string, LineageEdgeRow>;
}

/** A fresh, empty current-state — pass a new one per fold so re-folds are independent (P6.1 contract). */
export function emptyCurrentState(): CurrentState {
  return {
    runs: {},
    generations: {},
    agenomes: {},
    candidateIdeas: {},
    criticReviews: {},
    checkResults: {},
    noveltyScores: {},
    fitnessScores: {},
    judgeResults: {},
    lineageEdges: {},
  };
}

/**
 * Extract a non-empty string `id` from a (validated, JSON-plain) event payload, or null if absent. The
 * high-traffic payloads are frozen entities with a required `id`; the null guard is defensive so a
 * malformed payload folds to a no-op rather than crashing the rebuild.
 */
export function payloadId(payload: unknown): string | null {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const id = (payload as Record<string, unknown>).id;
    if (typeof id === 'string' && id.length > 0) {
      return id;
    }
  }
  return null;
}
