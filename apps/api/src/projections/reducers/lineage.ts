import { CullingEvent, ReproductionEvent, type CandidateIdea } from '@doppl/contracts';
import type { RunEventRow } from '../projection-builder';
import type { CurrentState } from './state';

/**
 * Lineage reducer (ARCHITECTURE.md §8/§9): genealogy + culling.
 *
 * - Reproduction (`agenome.fused`/`mutated`/`reproduced`) carries a `ReproductionEvent` → one
 *   lineage edge per parent → child (id = `parent->child`, type = mode). Parsed via `safeParse`; an
 *   unparseable payload folds to a no-op (defensive — the rebuild never crashes on a stray payload).
 * - Cull (`lineage.culled`) carries a `CullingEvent` → each targeted entity moves to `culled`. Targets
 *   may be candidates or agenomes (the id is looked up in both); a cull is a STATUS transition, not an
 *   edge (an edge needs source→target, which a cull has neither — Step-2.5 confirmed).
 */

const REPRODUCTION_TYPES: ReadonlySet<string> = new Set([
  'agenome.fused',
  'agenome.mutated',
  'agenome.reproduced',
]);

export function lineageReducer(state: CurrentState, event: RunEventRow): CurrentState {
  if (REPRODUCTION_TYPES.has(event.type)) {
    const parsed = ReproductionEvent.safeParse(event.payload);
    if (!parsed.success) return state;
    const { parentAgenomeIds, childAgenomeId, mode } = parsed.data;
    const lineageEdges = { ...state.lineageEdges };
    for (const parent of parentAgenomeIds) {
      const id = `${parent}->${childAgenomeId}`;
      lineageEdges[id] = { id, source: parent, target: childAgenomeId, type: mode };
    }
    return { ...state, lineageEdges };
  }

  if (event.type === 'lineage.culled') {
    const parsed = CullingEvent.safeParse(event.payload);
    if (!parsed.success) return state;
    let next = state;
    for (const targetId of parsed.data.targetIds) {
      next = markCulled(next, targetId, event);
    }
    return next;
  }

  return state;
}

function markCulled(state: CurrentState, targetId: string, event: RunEventRow): CurrentState {
  const candidate = state.candidateIdeas[targetId];
  if (candidate !== undefined) {
    return {
      ...state,
      candidateIdeas: {
        ...state.candidateIdeas,
        [targetId]: { ...candidate, status: 'culled' } as CandidateIdea,
      },
    };
  }
  const agenome = state.agenomes[targetId];
  if (agenome !== undefined) {
    return {
      ...state,
      agenomes: { ...state.agenomes, [targetId]: { ...agenome, status: 'culled' } },
    };
  }
  // Target not yet materialized — create a best-effort 'culled' agenome row (identity from envelope).
  return {
    ...state,
    agenomes: {
      ...state.agenomes,
      [targetId]: {
        id: targetId,
        runId: event.runId,
        generationId: event.generationId,
        status: 'culled',
      },
    },
  };
}
