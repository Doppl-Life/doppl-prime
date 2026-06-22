import { useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { StatusBadge } from '../core/StatusBadge';
import type { Run } from '../../data/contracts';
import type { RunClient } from '../../data/runClient';
import type { RunStore } from '../../state/runStore';
import { deriveStopControlState, selectRunStatus } from './runControl';

/**
 * StopControl — the operator run-stop button (sibling of the P7.5 run-config panel). It READS the
 * run's latest run-level status from the injected store (read-only, via `useSyncExternalStore`) and
 * ISSUES the idempotent POST /runs/:id/stop via the injected `runClient.stopRun` DIRECTLY — the two
 * writes go through the client, never the store (safety rule #2). The API + kernel own dedup + the
 * terminal guard (ARCHITECTURE.md §11); this handler never re-implements them. The control
 * disables/relabels ONLY from the authoritative folded terminal event (never optimistic). A command
 * failure surfaces an inline, programmatically-associated error and stays retry-safe (the command is
 * idempotent). Stop is NON-DESTRUCTIVE — the control never mutates the store's failures/entities, so
 * partial evidence up to the stop point remains rendered (REQ-F-012/REQ-O-002).
 *
 * The persistent mount (placing the control on the run screen, subscribed to the live store) is the
 * P7.14 shell; here it is exercised against an injected `runClient` + a seeded store.
 */
export interface StopControlProps {
  runId: string;
  store: Pick<RunStore, 'getState' | 'subscribe'>;
  runClient: Pick<RunClient, 'stopRun'>;
  onStopped?: (run: Run) => void;
}

const buttonBase: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  fontWeight: 600,
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-5)',
};
const buttonActive: CSSProperties = {
  ...buttonBase,
  color: 'var(--fg-on-accent)',
  background: 'var(--danger)',
  cursor: 'pointer',
};
const buttonDisabled: CSSProperties = {
  ...buttonBase,
  color: 'var(--fg-muted)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  cursor: 'not-allowed',
};
const errorText: CSSProperties = {
  color: 'var(--danger)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-caption)',
};

export function StopControl({ runId, store, runClient, onStopped }: StopControlProps) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const [stopping, setStopping] = useState(false);
  const [errored, setErrored] = useState(false);

  const runStatus = selectRunStatus(state, runId);
  const control = deriveStopControlState({ runStatus, stopping, errored });

  const handleStop = () => {
    // disabled-when-terminal + no double-fire while in flight (the guard mirrors `control.disabled`,
    // so a click can never start a second/contradictory command — the API also dedups, §11).
    if (control.disabled || stopping) return;
    setErrored(false);
    setStopping(true);
    runClient
      .stopRun(runId)
      .then((run) => onStopped?.(run))
      .catch(() => setErrored(true))
      .finally(() => setStopping(false));
  };

  const errId = `stop-${runId}-err`;
  // The status-map `run` domain keys are unprefixed (`stopped`/`completed`/`failed`); strip `run.`.
  const bareStatus = control.terminalStatus?.split('.')[1];

  return (
    <section aria-label="Run stop control" style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <button
        type="button"
        onClick={handleStop}
        disabled={control.disabled}
        aria-describedby={errored ? errId : undefined}
        style={control.disabled ? buttonDisabled : buttonActive}
      >
        {control.label}
      </button>
      {control.phase === 'terminal' && bareStatus && (
        <StatusBadge domain="run" status={bareStatus} />
      )}
      {errored && (
        <span id={errId} role="alert" style={errorText}>
          Failed to stop the run — retry.
        </span>
      )}
    </section>
  );
}
