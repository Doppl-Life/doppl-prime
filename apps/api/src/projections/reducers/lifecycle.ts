import type { GenerationStatus, RunStatus } from '@doppl/contracts';
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
};

const GENERATION_TRANSITIONS: Readonly<Record<string, GenerationStatus>> = {
  'generation.started': 'running',
  'generation.verifying': 'verifying',
  'generation.scoring': 'scoring',
  'generation.reproducing': 'reproducing',
  'generation.completed': 'completed',
  generation_failed: 'failed',
};

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

  if (event.type === 'agenome.reproduced' && event.agenomeId !== null) {
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
          status: 'reproduced',
        },
      },
    };
  }

  return state;
}
