import { ReproductionEvent, type GenerationStatus, type RunStatus } from '@doppl/contracts';
import type { RunEventRow } from '../projection-builder';
import type { CurrentState } from './state';

/**
 * Lifecycle reducer (ARCHITECTURE.md §3 state machines): folds run / generation / agenome lifecycle
 * events into their current-state STATUS, keyed by the envelope's id. Terminal/failure events move the
 * affected entity to its frozen-enum terminal status.
 *
 * Spec-grounded transition decisions (Step-2.5 confirmed):
 * - `energy_exhausted` is NOT a run terminal — §5 drains + scores, then the kernel emits
 *   `run.completed`/`run.failed` (which carries the survivor count §3 needs to pick the terminal). So
 *   `energy_exhausted` folds to a no-op for run status; the following terminal event sets it.
 * - `generation.verifying`/`scoring`/`reproducing` ARE durable generation phases (the frozen
 *   `GenerationStatus` enum has them, and these markers are their only source) → applied to status.
 *   The other 8 operation-start markers are transient live-view signals (§12, P6.9) → no-op (handled
 *   by falling through to `return state`).
 */

const RUN_TRANSITIONS: Readonly<Record<string, RunStatus>> = {
  'run.configured': 'configured',
  'run.started': 'running',
  'run.completed': 'completed',
  'run.failed': 'failed',
  'run.stopped': 'stopped',
  'run.cancelled': 'cancelled', // sv5 terminal (configured→cancelled, kill switch)
};

const GENERATION_TRANSITIONS: Readonly<Record<string, GenerationStatus>> = {
  'generation.started': 'running',
  'generation.verifying': 'verifying',
  'generation.scoring': 'scoring',
  'generation.reproducing': 'reproducing',
  'generation.completed': 'completed',
  generation_failed: 'failed',
  'generation.skipped': 'skipped', // sv5 terminal (pending→skipped, kill switch)
};

/**
 * Reproduction events (§8) all carry a `ReproductionEvent` payload (parent ids + the distinct child id).
 * `lineage.ts` already folds these into genealogy EDGES; here they additionally materialize the CHILD
 * agenome ENTITY (see `materializeReproducedChild`). All three are handled (mirrors `lineage.ts`);
 * `agenome.mutated` is in the frozen registry but not yet emitted — handling it is forward-compatible.
 */
const REPRODUCTION_TYPES: ReadonlySet<string> = new Set([
  'agenome.fused',
  'agenome.mutated',
  'agenome.reproduced',
]);

/** The generation loop's per-generation id scheme (generationLoop.ts / successor-threading.ts). */
const GENERATION_ID_PATTERN = /^(.*-gen)(\d+)$/;

/**
 * A reproduction event is emitted DURING the parent's generation N (envelope.generationId = gen N), but
 * the child is re-homed to gen N+1 by successor-threading (which emits NO event — rule #2). So the child's
 * OWN generation is gen N+1, derived from the parent gen on the envelope via the loop's "<runId>-gen<N>"
 * convention. A non-conventional id (e.g. a test fixture) gracefully falls back to the envelope id — a
 * projection NEVER throws on a stray payload (unlike the live successor-threading derivation, which fails
 * loud because a garbage child gen there would corrupt the persisted lineage).
 */
function deriveChildGenerationId(parentGenerationId: string | null): string | null {
  if (parentGenerationId === null) return null;
  const match = GENERATION_ID_PATTERN.exec(parentGenerationId);
  if (match === null) return parentGenerationId;
  return `${match[1]}${Number(match[2]) + 1}`;
}

/**
 * Materialize the CHILD agenome of a reproduction event into state.agenomes as a freshly-born offspring:
 * status 'seeded' (matching `agenome.spawned` + successor-threading's `rehome`, §3 seeded→active), homed to
 * its OWN gen N+1. WITHOUT this the child never entered state.agenomes → no agenome node in the lineage
 * graph → the child's gen-N+1 candidates floated disconnected (the lineage-projection bug). Additive to the
 * genealogy-edge fold in `lineage.ts` (which is untouched). A re-fold is idempotent (keyed SET); should a
 * later event already have set a richer status for the child, the materialize is order-dependent like every
 * other branch — but reproduction precedes the child's own gen N+1, so 'seeded' is the correct birth state.
 */
function materializeReproducedChild(state: CurrentState, event: RunEventRow): CurrentState {
  const parsed = ReproductionEvent.safeParse(event.payload);
  if (!parsed.success) return state; // unparseable payload → no-op (rebuild never crashes)
  const childId = parsed.data.childAgenomeId;
  return {
    ...state,
    agenomes: {
      ...state.agenomes,
      [childId]: {
        id: childId,
        runId: event.runId,
        generationId: deriveChildGenerationId(event.generationId),
        status: 'seeded',
      },
    },
  };
}

export function lifecycleReducer(state: CurrentState, event: RunEventRow): CurrentState {
  const runStatus = RUN_TRANSITIONS[event.type];
  if (runStatus !== undefined) {
    return {
      ...state,
      runs: { ...state.runs, [event.runId]: { id: event.runId, status: runStatus } },
    };
  }

  const generationStatus = GENERATION_TRANSITIONS[event.type];
  if (generationStatus !== undefined && event.generationId !== null) {
    const id = event.generationId;
    return {
      ...state,
      generations: {
        ...state.generations,
        [id]: { id, runId: event.runId, status: generationStatus },
      },
    };
  }

  if (event.type === 'agenome.spawned' && event.agenomeId !== null) {
    const id = event.agenomeId;
    return {
      ...state,
      agenomes: {
        ...state.agenomes,
        [id]: { id, runId: event.runId, generationId: event.generationId, status: 'seeded' },
      },
    };
  }

  // Reproduction (§8): materialize the CHILD agenome (the bug fix — see materializeReproducedChild), AND,
  // when the envelope names the parent that reproduced, move that parent to 'reproduced' (§3
  // eligible_parent→reproduced). The live `agenome.fused`/`reproduced` emitters leave envelope.agenomeId
  // null (the parents ride the payload), so the parent transition fires only when a producer set it.
  if (REPRODUCTION_TYPES.has(event.type)) {
    let next = materializeReproducedChild(state, event);
    if (event.agenomeId !== null) {
      const id = event.agenomeId;
      const existing = next.agenomes[id];
      next = {
        ...next,
        agenomes: {
          ...next.agenomes,
          [id]: {
            id,
            runId: event.runId,
            generationId: existing?.generationId ?? event.generationId,
            status: 'reproduced',
          },
        },
      };
    }
    return next;
  }

  // sv5 terminal — an agenome moves to its frozen 'failed' status (active→failed; mirrors the
  // reproduced branch: update-or-materialize, preserving the existing generation identity).
  if (event.type === 'agenome.failed' && event.agenomeId !== null) {
    const id = event.agenomeId;
    const existing = state.agenomes[id];
    return {
      ...state,
      agenomes: {
        ...state.agenomes,
        [id]: {
          id,
          runId: event.runId,
          generationId: existing?.generationId ?? event.generationId,
          status: 'failed',
        },
      },
    };
  }

  return state;
}
