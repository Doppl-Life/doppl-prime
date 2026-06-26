import type { CSSProperties, MouseEvent } from 'react';
import { Button, StatusBadge } from '../ds';
import type { RunSummary } from '../../data/runClient';

/**
 * RunCard (FV.2) — the S0 Runs Home per-run card, composed from the ds/ primitives. Machine-truth-
 * minimal: RunSummary carries only {runId, status, sequenceThrough}, so the card shows exactly that
 * (no fabricated title/energy/winner — DS rule 5). Status is shape+icon+label via the run-domain
 * StatusBadge (never color alone, rule #4). Per-card actions are derived from the run status.
 */
export interface RunCardProps {
  run: RunSummary;
  onOpenLive: (runId: string) => void;
  onReplay: (runId: string) => void;
  onFinal: (runId: string) => void;
  /** Whole-card click target — navigates to the run's primary view (derived from status). */
  onOpenCard: (runId: string) => void;
}

interface ActionSet {
  openLive: boolean;
  replay: boolean;
  final: boolean;
}

/** live → Open live; completed/stopped → Replay + Final idea; failed/cancelled → Replay only;
 *  configured/null/unknown → nothing to observe yet. */
function actionsFor(status: string | null): ActionSet {
  switch (status) {
    case 'running':
    case 'completing':
      return { openLive: true, replay: false, final: false };
    case 'completed':
    case 'stopped':
      return { openLive: false, replay: true, final: true };
    case 'failed':
    case 'cancelled':
      return { openLive: false, replay: true, final: false };
    default:
      return { openLive: false, replay: false, final: false };
  }
}

const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4)',
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
  textAlign: 'left',
  color: 'inherit',
};
const headerRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' };
const runId: CSSProperties = {
  marginLeft: 'auto',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: 'var(--fg-default)',
};
const meta: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const actionsRow: CSSProperties = { display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' };

export function RunCard({ run, onOpenLive, onReplay, onFinal, onOpenCard }: RunCardProps) {
  const actions = actionsFor(run.status);
  const stop = (cb: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    cb();
  };
  return (
    <button
      type="button"
      data-testid="run-card"
      aria-label={`Open run ${run.runId}`}
      style={card}
      onClick={() => onOpenCard(run.runId)}
    >
      <div style={headerRow}>
        <StatusBadge domain="run" status={run.status ?? 'unknown'} size="sm" />
        <span style={runId}>{run.runId}</span>
      </div>
      <div style={meta}>seq {run.sequenceThrough}</div>
      <div style={actionsRow}>
        {actions.openLive && (
          <Button size="sm" variant="primary" glyph="▸" onClick={stop(() => onOpenLive(run.runId))}>
            Open live
          </Button>
        )}
        {actions.replay && (
          <Button size="sm" variant="secondary" glyph="⏮" onClick={stop(() => onReplay(run.runId))}>
            Replay
          </Button>
        )}
        {actions.final && (
          <Button size="sm" variant="ghost" glyph="♔" onClick={stop(() => onFinal(run.runId))}>
            Final idea
          </Button>
        )}
      </div>
    </button>
  );
}
