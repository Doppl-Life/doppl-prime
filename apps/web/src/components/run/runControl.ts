import type { RunEventType } from '../../data/contracts';
import type { ViewState } from '../../state/reducer';

/**
 * runControl — the pure run-stop control logic (sibling of P7.5's runConfigForm). It classifies the
 * authoritative run-terminal state and derives the stop button's label/disabled from store state +
 * the local command status. The UI issues the idempotent POST /runs/:id/stop and lets the API + kernel
 * own dedup + the terminal guard (ARCHITECTURE.md §11, safety rule #2) — this module NEVER guesses
 * terminal optimistically: the ONLY authoritative terminal is the folded run.stopped/completed/failed
 * event reflected in the store.
 */

/**
 * The 3 run-terminal `RunEventType` members (ARCHITECTURE.md §11; the run-level terminals in
 * `event-type.ts`). NOTE: `run.cancelled` is a `RunStatus` value, NOT a `RunEventType`, so it is
 * intentionally absent — the store carries event types, and no `run.cancelled` event exists.
 */
export const RUN_TERMINAL_TYPES: ReadonlySet<RunEventType> = new Set<RunEventType>([
  'run.completed',
  'run.failed',
  'run.stopped',
]);

/** True iff the run-level event type is one of the 3 run-terminal types. Pure, total over RunEventType. */
export function isRunTerminal(status: RunEventType): boolean {
  return RUN_TERMINAL_TYPES.has(status);
}

/**
 * The run entity's latest run-level event type from the store, or `undefined` before any run-level
 * event has folded in. The run entity is keyed by `runId` with kind `'run'` (reducer.resolveEntity);
 * we guard the kind so a non-run entity sharing the id can never be misread as a run status.
 */
export function selectRunStatus(state: ViewState, runId: string): RunEventType | undefined {
  const entity = state.entities[runId];
  return entity && entity.kind === 'run' ? entity.status : undefined;
}

export type StopControlPhase = 'idle' | 'stopping' | 'terminal' | 'error';

export interface StopControlInput {
  /** The run's latest run-level event type from the store (`undefined` = not yet seen). */
  readonly runStatus: RunEventType | undefined;
  /** A local `stopRun` command is in flight (the promise is pending). */
  readonly stopping: boolean;
  /** The last `stopRun` command failed and no terminal event has since folded in. */
  readonly errored: boolean;
}

export interface StopControlState {
  readonly phase: StopControlPhase;
  readonly label: string;
  readonly disabled: boolean;
  /** Present ONLY when `phase === 'terminal'` — the run-terminal type for the StatusBadge. */
  readonly terminalStatus?: RunEventType;
}

/** Terminal button labels keyed by the run-terminal event type. */
const TERMINAL_LABEL: Readonly<Record<string, string>> = {
  'run.completed': 'Run completed',
  'run.failed': 'Run failed',
  'run.stopped': 'Run stopped',
};

/**
 * Derive the stop control's `{phase,label,disabled}` from store-derived run status + local command
 * status. Precedence: **terminal > stopping > errored > idle**. The authoritative terminal (from the
 * folded event) ALWAYS wins over a local in-flight/error state — so the control never shows itself
 * terminal optimistically, and a settled terminal supersedes any stale local status.
 */
export function deriveStopControlState(input: StopControlInput): StopControlState {
  const { runStatus, stopping, errored } = input;
  if (runStatus !== undefined && isRunTerminal(runStatus)) {
    return {
      phase: 'terminal',
      label: TERMINAL_LABEL[runStatus] ?? 'Run ended',
      disabled: true,
      terminalStatus: runStatus,
    };
  }
  if (stopping) {
    return { phase: 'stopping', label: 'Stopping…', disabled: true };
  }
  if (errored) {
    return { phase: 'error', label: 'Retry stop', disabled: false };
  }
  return { phase: 'idle', label: 'Stop run', disabled: false };
}
