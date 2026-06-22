import type {
  CandidateIdea,
  CheckResult,
  CriticReview,
  FitnessScore,
  JudgeResult,
  NoveltyScore,
} from '@doppl/contracts';
import type { RunEventRow } from '../projection-builder';
import { payloadId, type CurrentState } from './state';

/**
 * Entities reducer (ARCHITECTURE.md §9): the high-traffic events carry their frozen Appendix-A model
 * as the payload (P0.10 narrowing — validated at append), so the current-state row IS that payload,
 * stored VERBATIM keyed by its id. `novelty.scored` therefore reads the persisted vector /
 * embeddingModelId / dimension back unchanged and NEVER re-embeds (rule #7, authoritative-once-
 * computed). `candidate_invalidated` moves an existing candidate to the frozen `invalid` status; the
 * candidate's pre-terminal status is whatever `candidate.created` carried (fine-grained under_review/
 * checked/scored advancement is deferred — no event clearly maps to it; Step-2.5 confirmed).
 */
export function entitiesReducer(state: CurrentState, event: RunEventRow): CurrentState {
  switch (event.type) {
    case 'candidate.created': {
      const id = payloadId(event.payload);
      if (id === null) return state;
      return {
        ...state,
        candidateIdeas: { ...state.candidateIdeas, [id]: event.payload as CandidateIdea },
      };
    }
    case 'candidate_invalidated': {
      const id = event.candidateId;
      if (id === null) return state;
      const existing = state.candidateIdeas[id];
      if (existing === undefined) return state;
      return {
        ...state,
        candidateIdeas: {
          ...state.candidateIdeas,
          [id]: { ...existing, status: 'invalid' } as CandidateIdea,
        },
      };
    }
    case 'candidate.rejected': {
      // sv5 terminal — an existing candidate moves to the frozen 'rejected' status (mirrors
      // candidate_invalidated→'invalid'; envelope candidateId; no-op if the candidate isn't materialized).
      const id = event.candidateId;
      if (id === null) return state;
      const existing = state.candidateIdeas[id];
      if (existing === undefined) return state;
      return {
        ...state,
        candidateIdeas: {
          ...state.candidateIdeas,
          [id]: { ...existing, status: 'rejected' } as CandidateIdea,
        },
      };
    }
    case 'critic.reviewed': {
      const id = payloadId(event.payload);
      if (id === null) return state;
      return {
        ...state,
        criticReviews: { ...state.criticReviews, [id]: event.payload as CriticReview },
      };
    }
    case 'check.completed': {
      const id = payloadId(event.payload);
      if (id === null) return state;
      return {
        ...state,
        checkResults: { ...state.checkResults, [id]: event.payload as CheckResult },
      };
    }
    case 'novelty.scored': {
      const id = payloadId(event.payload);
      if (id === null) return state;
      return {
        ...state,
        noveltyScores: { ...state.noveltyScores, [id]: event.payload as NoveltyScore },
      };
    }
    case 'fitness.scored': {
      const id = payloadId(event.payload);
      if (id === null) return state;
      return {
        ...state,
        fitnessScores: { ...state.fitnessScores, [id]: event.payload as FitnessScore },
      };
    }
    case 'judge.reviewed': {
      // sv5 — the held-out judge's authoritative acceptance output (JudgeResult, validated at the append
      // boundary) stored VERBATIM keyed by its id, mirroring noveltyScores/fitnessScores (rule #7: read
      // back, never re-judged — the judge is the immutable fitness anchor, rule #6).
      const id = payloadId(event.payload);
      if (id === null) return state;
      return {
        ...state,
        judgeResults: { ...state.judgeResults, [id]: event.payload as JudgeResult },
      };
    }
    default:
      return state;
  }
}
