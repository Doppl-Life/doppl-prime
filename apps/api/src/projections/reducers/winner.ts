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

/**
 * The winner candidateIds from a (validated, JSON-plain) `run.completed` payload. Islands pivot A2: prefer
 * `finalIdeaRefs` (the top-N winners) when present + a non-empty array of non-empty strings; otherwise fall
 * back to the singular `finalIdeaRef` as a one-element list (backward compat — old fixtures + the byte-
 * identical single-winner default). An empty `finalIdeaRefs:[]` (survivors existed but none cleared the
 * crowning floor) → no winners. Returns [] when neither is present.
 */
function winnerRefs(payload: unknown): string[] {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;
  const refs = record.finalIdeaRefs;
  if (Array.isArray(refs)) {
    return refs.filter((r): r is string => typeof r === 'string' && r.length > 0);
  }
  const single = record.finalIdeaRef;
  return typeof single === 'string' && single.length > 0 ? [single] : [];
}

export function winnerReducer(state: CurrentState, event: RunEventRow): CurrentState {
  if (event.type !== 'run.completed') return state;
  const refs = winnerRefs(event.payload);
  if (refs.length === 0) return state;
  // SET each crowned candidate 'selected' (idempotent re-fold; copy-on-first-write). A ref to a
  // non-materialized candidate is a defensive no-op (mirrors the entities.ts existing===undefined guard).
  let candidateIdeas = state.candidateIdeas;
  for (const ref of refs) {
    const existing = candidateIdeas[ref];
    if (existing === undefined) continue;
    if (candidateIdeas === state.candidateIdeas) candidateIdeas = { ...candidateIdeas };
    candidateIdeas[ref] = { ...existing, status: 'selected' } as CandidateIdea;
  }
  return candidateIdeas === state.candidateIdeas ? state : { ...state, candidateIdeas };
}
