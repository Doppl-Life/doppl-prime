import type { CandidateIdea } from '@doppl/contracts';
import type { RunEventRow } from '../projection-builder';
import type { CurrentState } from './state';

/**
 * Winner reducer (PD.11 — ARCHITECTURE.md §10/§3/§12). The kernel records the final-idea winner ONLY as
 * `run.completed.finalIdeaRef` (the top `fitness.scored ∧ ¬lineage.culled` survivor — terminalClassifier,
 * LESSONS §68); no event carries a `'selected'` candidate status. This pure reducer bridges that gap: on
 * `run.completed` it reads `finalIdeaRef` from the (validated, JSON-plain) payload and SETs that
 * candidate's status to the frozen `'selected'` value (LESSONS §54 — winner = candidate node status
 * `'selected'`, no new node type / no new contract surface). The winner is DERIVED from the authoritative
 * kernel signal, never fabricated (rule #6): no `finalIdeaRef` (run.completed without it / run.failed) →
 * no-op; a `finalIdeaRef` to a non-materialized candidate → defensive no-op (mirrors the
 * `candidate_invalidated`/`candidate.rejected` `existing===undefined` guard, entities.ts).
 *
 * Appended LAST to the current-state REDUCERS so the candidate row is already materialized when the
 * terminal `run.completed` folds. It is a pure SET (idempotent re-fold; the converse of LESSONS §62's
 * "no event → no transition" — here there IS an authoritative event signal). Imports only contracts
 * types + `./state` (rule #7 — no provider/IO).
 */

/** Read a non-empty string `finalIdeaRef` from a (validated, JSON-plain) `run.completed` payload, or null. */
function finalIdeaRef(payload: unknown): string | null {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const ref = (payload as Record<string, unknown>).finalIdeaRef;
    if (typeof ref === 'string' && ref.length > 0) {
      return ref;
    }
  }
  return null;
}

export function winnerReducer(state: CurrentState, event: RunEventRow): CurrentState {
  if (event.type !== 'run.completed') return state;
  const ref = finalIdeaRef(event.payload);
  if (ref === null) return state;
  const existing = state.candidateIdeas[ref];
  if (existing === undefined) return state;
  return {
    ...state,
    candidateIdeas: {
      ...state.candidateIdeas,
      [ref]: { ...existing, status: 'selected' } as CandidateIdea,
    },
  };
}
