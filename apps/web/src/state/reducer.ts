import type {
  CandidateIdeaT,
  CheckResultT,
  CriticReviewT,
  FitnessScoreT,
  NoveltyScoreT,
  RunEventEnvelopeT,
} from "../data/contracts.js";

/**
 * Browser-side run-state reducer (P7.2). Mirrors the server's
 * apps/api/src/projections/current-state.ts fold but lives in the
 * dashboard so the React tree consumes a single typed shape derived
 * from the SSE event stream.
 *
 * Sequence is the SOLE ordering key. An event with
 * sequence <= state.sequenceThrough is a no-op (idempotent re-apply).
 */

export type ViewMode = "idle" | "live" | "polling" | "replay";

export interface RunRowView {
  id: string;
  status: string;
  configuredAt?: string;
  startedAt?: string;
  completedAt?: string;
  terminalReason?: string;
  seed?: string;
  capsConfig?: unknown;
}

export interface GenerationView {
  generationId: string;
  index: number;
  status: "started" | "completed" | "failed";
  candidateCount?: number;
}

export interface AgenomeView {
  id: string;
  parentIds: string[];
  status: string;
}

export interface CandidateView {
  id: string;
  agenomeId: string;
  generationId?: string;
  subtype?: string;
  status: string;
  summary?: string;
}

export interface LineageEdgeView {
  source: string;
  target: string;
  mode: string;
}

export interface FailureEventView {
  sequence: number;
  type: string;
  payload: unknown;
}

export interface CapsConsumed {
  energy: number;
  generations: number;
  candidates: number;
  toolCalls: number;
}

export interface RunStoreState {
  runId: string | null;
  mode: ViewMode;
  sequenceThrough: number;
  errors: { sequence: number; type: string; message: string }[];
  failureEvents: FailureEventView[];
  run: RunRowView | null;
  generations: Record<string, GenerationView>;
  agenomes: Record<string, AgenomeView>;
  candidates: Record<string, CandidateView>;
  criticReviews: Record<string, CriticReviewT>;
  checkResults: Record<string, CheckResultT>;
  fitnessScores: Record<string, FitnessScoreT>;
  noveltyScores: Record<string, NoveltyScoreT>;
  energySpend: Record<string, number>;
  capsConsumed: CapsConsumed;
  selection: {
    candidateId: string | null;
    agenomeId: string | null;
  };
}

export const initialRunStoreState: RunStoreState = {
  runId: null,
  mode: "idle",
  sequenceThrough: -1,
  errors: [],
  failureEvents: [],
  run: null,
  generations: {},
  agenomes: {},
  candidates: {},
  criticReviews: {},
  checkResults: {},
  fitnessScores: {},
  noveltyScores: {},
  energySpend: {},
  capsConsumed: { energy: 0, generations: 0, candidates: 0, toolCalls: 0 },
  selection: { candidateId: null, agenomeId: null },
};

export type RunStoreAction =
  | { kind: "APPLY_EVENT"; event: RunEventEnvelopeT }
  | { kind: "SET_MODE"; mode: ViewMode }
  | { kind: "RESET" }
  | { kind: "SET_RUN_ID"; runId: string | null }
  | { kind: "SELECT_CANDIDATE"; candidateId: string | null }
  | { kind: "SELECT_AGENOME"; agenomeId: string | null }
  | { kind: "RECORD_ERROR"; sequence: number; type: string; message: string };

interface RunConfiguredPayload {
  config?: { caps?: unknown; seed?: string };
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
  candidate?: CandidateIdeaT;
}

interface CandidateInvalidatedPayload {
  candidateId?: string;
}

interface CriticReviewedPayload {
  review?: CriticReviewT;
}

interface CheckCompletedPayload {
  result?: CheckResultT;
}

interface NoveltyScoredPayload {
  novelty?: NoveltyScoreT;
}

interface FitnessScoredPayload {
  fitness?: FitnessScoreT;
}

interface ReproductionPayload {
  reproduction?: {
    parentAgenomeIds: string[];
    childAgenomeId: string;
    mode: string;
  };
}

interface EnergySpentPayload {
  energy?: {
    agenomeId?: string;
    actual?: number;
    estimate?: number;
    eventType?: string;
  };
}

function applyEvent(state: RunStoreState, event: RunEventEnvelopeT): RunStoreState {
  if (event.sequence <= state.sequenceThrough) return state;
  const next: RunStoreState = { ...state, sequenceThrough: event.sequence };
  if (!next.runId) next.runId = event.runId;

  switch (event.type) {
    case "run.configured": {
      const p = event.payload as RunConfiguredPayload;
      next.run = {
        id: event.runId,
        status: "configured",
        configuredAt: String(event.occurredAt),
        ...(p.config?.seed !== undefined ? { seed: p.config.seed } : {}),
        ...(p.config?.caps !== undefined ? { capsConfig: p.config.caps } : {}),
      };
      return next;
    }
    case "run.started": {
      const p = event.payload as { startedAt?: string };
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
          generationId,
          index: p.index ?? 0,
          status: "started",
        },
      };
      next.capsConsumed = {
        ...next.capsConsumed,
        generations: Object.values(next.generations).length,
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
      next.failureEvents = [
        ...next.failureEvents,
        { sequence: event.sequence, type: event.type, payload: event.payload },
      ];
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
          summary: cand.summary,
        },
      };
      if (!next.agenomes[cand.agenomeId]) {
        next.agenomes = {
          ...next.agenomes,
          [cand.agenomeId]: { id: cand.agenomeId, parentIds: [], status: "seeded" },
        };
      }
      next.capsConsumed = {
        ...next.capsConsumed,
        candidates: Object.keys(next.candidates).length,
      };
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
      next.failureEvents = [
        ...next.failureEvents,
        { sequence: event.sequence, type: event.type, payload: event.payload },
      ];
      return next;
    }
    case "critic.reviewed": {
      const p = event.payload as CriticReviewedPayload;
      const review = p.review;
      if (!review) return next;
      next.criticReviews = { ...next.criticReviews, [review.id]: review };
      return next;
    }
    case "check.completed": {
      const p = event.payload as CheckCompletedPayload;
      const result = p.result;
      if (!result) return next;
      next.checkResults = { ...next.checkResults, [result.id]: result };
      return next;
    }
    case "novelty.scored": {
      const p = event.payload as NoveltyScoredPayload;
      const novelty = p.novelty;
      if (!novelty) return next;
      next.noveltyScores = { ...next.noveltyScores, [novelty.id]: novelty };
      return next;
    }
    case "fitness.scored": {
      const p = event.payload as FitnessScoredPayload;
      const fitness = p.fitness;
      if (!fitness) return next;
      next.fitnessScores = { ...next.fitnessScores, [fitness.id]: fitness };
      return next;
    }
    case "energy.spent": {
      const p = event.payload as EnergySpentPayload;
      const energy = p.energy;
      if (!energy?.agenomeId) return next;
      const spend = energy.actual ?? energy.estimate ?? 0;
      const prev = next.energySpend[energy.agenomeId] ?? 0;
      next.energySpend = { ...next.energySpend, [energy.agenomeId]: prev + spend };
      next.capsConsumed = {
        ...next.capsConsumed,
        energy: next.capsConsumed.energy + spend,
        toolCalls:
          energy.eventType === "tool"
            ? next.capsConsumed.toolCalls + 1
            : next.capsConsumed.toolCalls,
      };
      return next;
    }
    case "provider_call_failed":
    case "output_schema_rejected":
    case "energy_exhausted":
    case "reproduction_aborted_insufficient_parents":
    case "novelty_scoring_degraded":
      next.failureEvents = [
        ...next.failureEvents,
        { sequence: event.sequence, type: event.type, payload: event.payload },
      ];
      return next;
    default:
      return next;
  }
}

export function runStoreReducer(state: RunStoreState, action: RunStoreAction): RunStoreState {
  switch (action.kind) {
    case "APPLY_EVENT":
      return applyEvent(state, action.event);
    case "SET_MODE":
      return state.mode === action.mode ? state : { ...state, mode: action.mode };
    case "SET_RUN_ID":
      return state.runId === action.runId ? state : { ...state, runId: action.runId };
    case "SELECT_CANDIDATE":
      return {
        ...state,
        selection: {
          ...state.selection,
          candidateId: action.candidateId,
        },
      };
    case "SELECT_AGENOME":
      return {
        ...state,
        selection: {
          ...state.selection,
          agenomeId: action.agenomeId,
        },
      };
    case "RECORD_ERROR":
      return {
        ...state,
        errors: [
          ...state.errors,
          { sequence: action.sequence, type: action.type, message: action.message },
        ],
      };
    case "RESET":
      return initialRunStoreState;
  }
}
