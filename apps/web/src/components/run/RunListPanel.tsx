import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { StatusBadge } from '../core/StatusBadge';
import type { RunClient, RunSummary } from '../../data/runClient';

/**
 * PD.17 — RunListPanel: the run-list / replay browser (ARCHITECTURE.md §12/§11/§17). Lists past runs
 * (GET /runs via `runClient.listRuns`, reconciled PD.15) + lets the operator click any run → observe it
 * in REPLAY mode via `onReplay` (the shared Dashboard replay-switch; reused by the fallback replay rung).
 * Read-only over projections (rule #2) — no new API route, never mutates authoritative state. Status via
 * the §12 StatusBadge (shape + label + color, never color alone — rule #4); a run with no current-state
 * status renders the neutral indicator. Empty / loading / error are non-fatal. Adherence: var() tokens only.
 */
export interface RunListPanelProps {
  runClient: Pick<RunClient, 'listRuns'>;
  /** Observe the clicked run in REPLAY mode (the shared Dashboard replay-switch). */
  onReplay: (runId: string) => void;
  /** The currently-observed run — indicated as current (aria-current). */
  observedRunId?: string;
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly runs: readonly RunSummary[] };

const muted: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
  margin: 0,
};
const errorStyle: CSSProperties = { ...muted, color: 'var(--danger)' };
const list: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--space-1)',
};
const entry: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  width: '100%',
  textAlign: 'left',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2) var(--space-3)',
  cursor: 'pointer',
};
const entryCurrent: CSSProperties = {
  borderColor: 'var(--accent)',
  background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
};

export function RunListPanel({ runClient, onReplay, observedRunId }: RunListPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    runClient
      .listRuns()
      .then((runs) => {
        if (active) setState({ kind: 'ready', runs });
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      });
    return () => {
      active = false;
    };
  }, [runClient]);

  if (state.kind === 'loading') {
    return (
      <p role="status" style={muted}>
        Loading runs…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p role="alert" style={errorStyle}>
        Failed to load runs — retry.
      </p>
    );
  }
  if (state.runs.length === 0) {
    return (
      <p role="status" style={muted}>
        No runs yet — start one above.
      </p>
    );
  }

  return (
    <ul aria-label="Run list" style={list}>
      {state.runs.map((run) => {
        const current = run.runId === observedRunId;
        return (
          <li key={run.runId}>
            <button
              type="button"
              onClick={() => onReplay(run.runId)}
              aria-current={current ? 'true' : undefined}
              style={current ? { ...entry, ...entryCurrent } : entry}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)' }}>
                {run.runId}
              </span>
              <StatusBadge domain="run" status={run.status ?? 'unknown'} size="sm" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
