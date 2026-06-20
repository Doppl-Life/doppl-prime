import type {
  CandidateIdea,
  CheckResult,
  CriticReview,
  FitnessScore,
  NoveltyScore,
  ReproductionEvent,
  RunEventEnvelope,
} from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { buildProjection } from "./projection-builder.js";

/**
 * Current-state projection (P6.2). Folds the full RunEventType stream
 * into a typed per-entity read model. Idempotent: re-folding the same
 * events yields the same state. Novelty vectors are preserved verbatim
 * — never recomputed.
 *
 * Reducers are kept in one file to make the entity inventory + the
 * event→entity routing visible at a glance. Per-entity helpers are
 * exported so callers can compose them differently if needed (e.g.,
 * the lineage-graph builder pulls only the agenome + candidate slices).
 */

export interface RunRow {
  id: string;
  status: "configured" | "running" | "completed" | "stopped" | "failed" | "cancelled";
  caps?: unknown;
  seed?: string;
  configuredAt?: string;
  startedAt?: string;
  completedAt?: string;
  terminalReason?: string;
}

export interface GenerationRow {
  runId: string;
  generationId: string;
  index: number;
  status: "started" | "completed" | "failed";
  candidateCount?: number;
  completedAt?: string;
}

export interface AgenomeRow {
  id: string;
  parentIds: string[];
  status: string;
}

export interface CandidateRow {
  id: string;
  agenomeId: string;
  generationId?: string;
  subtype?: string;
  status: string;
}

export interface CriticReviewRow {
  id: string;
  candidateId: string;
  mandate: string;
  confidence: number;
  evidenceRefs: unknown[];
}

export interface CheckResultRow {
  id: string;
  candidateId: string;
  checkType: string;
  status: string;
  score?: number;
}

export interface FitnessRow {
  id: string;
  candidateId: string;
  total: number;
  components: Record<string, number>;
  policyVersion: string;
}

export interface NoveltyRow {
  id: string;
  candidateId: string;
  score: number;
  embeddingModelId: string;
  dimension: number;
  vector: number[];
}

export interface LineageEdge {
  source: string;
  target: string;
  mode: string;
}

export interface CurrentState {
  runId: string | null;
  run?: RunRow;
  generations: Record<string, GenerationRow>;
  agenomes: Record<string, AgenomeRow>;
  candidates: Record<string, CandidateRow>;
  criticReviews: Record<string, CriticReviewRow>;
  checkResults: Record<string, CheckResultRow>;
  fitnessScores: Record<string, FitnessRow>;
  noveltyScores: Record<string, NoveltyRow>;
  lineageEdges: LineageEdge[];
}

export function emptyState(): CurrentState {
  return {
    runId: null,
    generations: {},
    agenomes: {},
    candidates: {},
    criticReviews: {},
    checkResults: {},
    fitnessScores: {},
    noveltyScores: {},
    lineageEdges: [],
  };
}

interface RunConfiguredPayload {
  config?: { caps?: unknown; seed?: string; rngSeed?: string };
}

interface RunStartedPayload {
  startedAt?: string;
}

interface RunCompletedPayload {
  completedAt?: string;
  terminalSummary?: string;
}

interface RunStoppedFailedPayload {
  reason?: string;
}

interface GenerationStartedPayload {
  index?: number;
}

interface GenerationCompletedPayload {
  completedAt?: string;
  candidateCount?: number;
}

interface CandidateCreatedPayload {
  candidate?: CandidateIdea;
}

interface CandidateInvalidatedPayload {
  candidateId?: string;
}

interface CriticReviewedPayload {
  review?: CriticReview;
}

interface CheckCompletedPayload {
  result?: CheckResult;
}

interface NoveltyScoredPayload {
  novelty?: NoveltyScore;
}

interface FitnessScoredPayload {
  fitness?: FitnessScore;
}

interface ReproductionPayload {
  reproduction?: ReproductionEvent;
}

function occurredAtString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date(0).toISOString();
}

function reduce(state: CurrentState, event: RunEventEnvelope): CurrentState {
  const next: CurrentState = { ...state, runId: state.runId ?? event.runId };
  switch (event.type) {
    case "run.configured": {
      const p = event.payload as RunConfiguredPayload;
      next.run = {
        id: event.runId,
        status: "configured",
        ...(p.config?.caps !== undefined ? { caps: p.config.caps } : {}),
        ...(p.config?.seed !== undefined ? { seed: p.config.seed } : {}),
        configuredAt: occurredAtString(event.occurredAt),
      };
      return next;
    }
    case "run.started": {
      const p = event.payload as RunStartedPayload;
      if (next.run) {
        next.run = {
          ...next.run,
          status: "running",
          ...(p.startedAt !== undefined ? { startedAt: p.startedAt } : {}),
        };
      }
      return next;
    }
    case "run.completed": {
      const p = event.payload as RunCompletedPayload;
      if (next.run) {
        next.run = {
          ...next.run,
          status: "completed",
          ...(p.completedAt !== undefined ? { completedAt: p.completedAt } : {}),
          ...(p.terminalSummary !== undefined ? { terminalReason: p.terminalSummary } : {}),
        };
      }
      return next;
    }
    case "run.stopped": {
      const p = event.payload as RunStoppedFailedPayload;
      if (next.run) {
        next.run = {
          ...next.run,
          status: "stopped",
          ...(p.reason !== undefined ? { terminalReason: p.reason } : {}),
        };
      }
      return next;
    }
    case "run.failed": {
      const p = event.payload as RunStoppedFailedPayload;
      if (next.run) {
        next.run = {
          ...next.run,
          status: "failed",
          ...(p.reason !== undefined ? { terminalReason: p.reason } : {}),
        };
      }
      return next;
    }
    case "generation.started": {
      const p = event.payload as GenerationStartedPayload;
      const generationId = event.generationId ?? `gen_${p.index ?? 0}`;
      next.generations = {
        ...next.generations,
        [generationId]: {
          runId: event.runId,
          generationId,
          index: p.index ?? 0,
          status: "started",
        },
      };
      return next;
    }
    case "generation.completed": {
      const p = event.payload as GenerationCompletedPayload;
      const generationId = event.generationId;
      if (!generationId) return next;
      const existing = next.generations[generationId];
      if (!existing) return next;
      next.generations = {
        ...next.generations,
        [generationId]: {
          ...existing,
          status: "completed",
          ...(p.candidateCount !== undefined ? { candidateCount: p.candidateCount } : {}),
          ...(p.completedAt !== undefined ? { completedAt: p.completedAt } : {}),
        },
      };
      return next;
    }
    case "generation_failed": {
      const generationId = event.generationId;
      if (!generationId) return next;
      const existing = next.generations[generationId];
      if (existing) {
        next.generations = {
          ...next.generations,
          [generationId]: { ...existing, status: "failed" },
        };
      }
      return next;
    }
    case "agenome.spawned":
    case "agenome.fused":
    case "agenome.mutated":
    case "agenome.reproduced": {
      const p = event.payload as ReproductionPayload;
      const repro = p.reproduction;
      if (!repro) return next;
      const childId = repro.childAgenomeId;
      next.agenomes = {
        ...next.agenomes,
        [childId]: {
          id: childId,
          parentIds: [...repro.parentAgenomeIds],
          status: "seeded",
        },
      };
      const newEdges: LineageEdge[] = repro.parentAgenomeIds.map((p) => ({
        source: p,
        target: childId,
        mode: repro.mode,
      }));
      next.lineageEdges = [...next.lineageEdges, ...newEdges];
      return next;
    }
    case "candidate.created": {
      const p = event.payload as CandidateCreatedPayload;
      const cand = p.candidate;
      if (!cand) return next;
      next.candidates = {
        ...next.candidates,
        [cand.id]: {
          id: cand.id,
          agenomeId: cand.agenomeId,
          generationId: cand.generationId,
          subtype: cand.subtype,
          status: cand.status,
        },
      };
      // Ensure the producing agenome exists in the projection even if no
      // explicit agenome.* event was emitted (Phase 3 emits candidate
      // directly).
      if (!next.agenomes[cand.agenomeId]) {
        next.agenomes = {
          ...next.agenomes,
          [cand.agenomeId]: { id: cand.agenomeId, parentIds: [], status: "seeded" },
        };
      }
      return next;
    }
    case "candidate_invalidated": {
      const p = event.payload as CandidateInvalidatedPayload;
      const cid = p.candidateId ?? event.candidateId;
      if (!cid) return next;
      const existing = next.candidates[cid];
      if (existing) {
        next.candidates = {
          ...next.candidates,
          [cid]: { ...existing, status: "invalid" },
        };
      }
      return next;
    }
    case "critic.reviewed": {
      const p = event.payload as CriticReviewedPayload;
      const review = p.review;
      if (!review) return next;
      next.criticReviews = {
        ...next.criticReviews,
        [review.id]: {
          id: review.id,
          candidateId: review.candidateId,
          mandate: review.mandate,
          confidence: review.confidence,
          evidenceRefs: review.evidenceRefs,
        },
      };
      return next;
    }
    case "check.completed": {
      const p = event.payload as CheckCompletedPayload;
      const result = p.result;
      if (!result) return next;
      next.checkResults = {
        ...next.checkResults,
        [result.id]: {
          id: result.id,
          candidateId: result.candidateId,
          checkType: result.checkType,
          status: result.status,
          ...(result.score !== undefined ? { score: result.score } : {}),
        },
      };
      return next;
    }
    case "novelty.scored": {
      const p = event.payload as NoveltyScoredPayload;
      const novelty = p.novelty;
      if (!novelty) return next;
      next.noveltyScores = {
        ...next.noveltyScores,
        [novelty.id]: {
          id: novelty.id,
          candidateId: novelty.candidateId,
          score: novelty.score,
          embeddingModelId: novelty.embeddingModelId,
          dimension: novelty.dimension,
          // Verbatim: replay invariant — never recomputed.
          vector: [...novelty.vector],
        },
      };
      return next;
    }
    case "fitness.scored": {
      const p = event.payload as FitnessScoredPayload;
      const fitness = p.fitness;
      if (!fitness) return next;
      next.fitnessScores = {
        ...next.fitnessScores,
        [fitness.id]: {
          id: fitness.id,
          candidateId: fitness.candidateId,
          total: fitness.total,
          components: { ...fitness.components },
          policyVersion: fitness.policyVersion,
        },
      };
      return next;
    }
    case "lineage.culled":
    case "energy.spent":
    case "provider_call_failed":
    case "output_schema_rejected":
    case "energy_exhausted":
    case "reproduction_aborted_insufficient_parents":
    case "novelty_scoring_degraded":
      // Operational events — no entity-level state update beyond what's
      // already captured by the run/generation status events.
      return next;
    default:
      return next;
  }
}

export interface BuildCurrentStateInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
}

export interface BuiltCurrentState {
  state: CurrentState;
  sequenceThrough: number;
  eventsConsumed: number;
}

export async function buildCurrentState(input: BuildCurrentStateInput): Promise<BuiltCurrentState> {
  return buildProjection<CurrentState>({
    db: input.db,
    runId: input.runId,
    initial: emptyState(),
    reduce,
  });
}
