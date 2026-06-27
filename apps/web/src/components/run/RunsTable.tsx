import type { CSSProperties, MouseEvent } from 'react';
import { Button, StatusBadge } from '../ds';
import type { RunSummary } from '../../data/runClient';

/**
 * RunsTable (S0 Runs home) — the date-sorted runs table. One row per run (the backend sorts newest-first),
 * columns for the run's metadata: a date-order index, a short id, the creation time, the problem, the
 * selected final idea, the status (StatusBadge — shape+label+icon, never color alone, rule #4), the
 * generation/candidate counts + a compact reproduction/cull/mutation activity cell, and a status-derived
 * action (Replay for a terminal run, Open live for a running one). Pure presentation over the enriched
 * RunSummary; read-only (rule #2) — actions navigate, they never mutate.
 */
export interface RunsTableProps {
  runs: readonly RunSummary[];
  /** Open the run's primary view (live vs replay derived by the caller from status). */
  onOpen: (runId: string, status: string | null) => void;
  onReplay: (runId: string) => void;
  onOpenLive: (runId: string) => void;
}

interface ActionSet {
  openLive: boolean;
  replay: boolean;
}
/** running/completing → Open live; completed/stopped/failed/cancelled → Replay; else → none. */
function actionsFor(status: string | null): ActionSet {
  switch (status) {
    case 'running':
    case 'completing':
      return { openLive: true, replay: false };
    case 'completed':
    case 'stopped':
    case 'failed':
    case 'cancelled':
      return { openLive: false, replay: true };
    default:
      return { openLive: false, replay: false };
  }
}

const EM_DASH = '—';
function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}
function formatDate(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
function orDash(text: string | null | undefined): string {
  return text !== null && text !== undefined && text.length > 0 ? text : EM_DASH;
}

const table: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-default)',
};
const th: CSSProperties = {
  textAlign: 'left',
  padding: 'var(--space-2) var(--space-3)',
  borderBottom: 'thin solid var(--border-subtle)',
  color: 'var(--fg-muted)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const thRight: CSSProperties = { ...th, textAlign: 'right' };
const td: CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  borderBottom: 'thin solid var(--border-subtle)',
  verticalAlign: 'middle',
};
const tdNum: CSSProperties = {
  ...td,
  textAlign: 'right',
  fontFamily: 'var(--font-mono)',
  color: 'var(--fg-muted)',
};
const tdMuted: CSSProperties = { ...td, color: 'var(--fg-muted)', whiteSpace: 'nowrap' };
const idButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: 'var(--accent)',
  cursor: 'pointer',
  textAlign: 'left',
};
const clamp: CSSProperties = {
  maxWidth: 'var(--space-9)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const activityCell: CSSProperties = { ...tdNum, whiteSpace: 'nowrap', color: 'var(--fg-muted)' };

export function RunsTable({ runs, onOpen, onReplay, onOpenLive }: RunsTableProps) {
  const stop = (cb: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    cb();
  };
  return (
    <table style={table}>
      <thead>
        <tr>
          <th style={thRight}>#</th>
          <th style={th}>Run</th>
          <th style={th}>Date</th>
          <th style={th}>Problem</th>
          <th style={th}>Final idea</th>
          <th style={th}>Status</th>
          <th style={thRight} title="generations completed">
            Gens
          </th>
          <th style={thRight} title="candidates created">
            Cands
          </th>
          <th style={thRight} title="reproductions · culls · mutations">
            ↻ ✕ ⤳
          </th>
          <th style={th}>Replay</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run, index) => {
          const actions = actionsFor(run.status);
          return (
            <tr key={run.runId}>
              <td style={tdNum}>{index + 1}</td>
              <td style={td}>
                <button
                  type="button"
                  aria-label={`Open run ${run.runId}`}
                  title={run.runId}
                  style={idButton}
                  onClick={() => onOpen(run.runId, run.status)}
                >
                  {shortId(run.runId)}
                </button>
              </td>
              <td style={tdMuted}>{formatDate(run.createdAt)}</td>
              <td style={td}>
                <div style={clamp} title={run.problem ?? undefined}>
                  {orDash(run.problem)}
                </div>
              </td>
              <td style={td}>
                <div style={clamp} title={run.finalIdeaSummary ?? run.finalIdeaTitle ?? undefined}>
                  {orDash(run.finalIdeaTitle)}
                </div>
              </td>
              <td style={td}>
                <StatusBadge domain="run" status={run.status ?? 'unknown'} size="sm" />
              </td>
              <td style={tdNum} data-testid={`run-gens-${run.runId}`}>
                {run.generations ?? 0}
              </td>
              <td style={tdNum} data-testid={`run-cands-${run.runId}`}>
                {run.candidates ?? 0}
              </td>
              <td
                style={activityCell}
                data-testid={`run-activity-${run.runId}`}
                title={`${run.reproductions ?? 0} reproductions · ${run.culls ?? 0} culls · ${run.mutations ?? 0} mutations`}
              >
                {`↻${run.reproductions ?? 0} ✕${run.culls ?? 0} ⤳${run.mutations ?? 0}`}
              </td>
              <td style={td}>
                {actions.replay && (
                  <Button
                    size="sm"
                    variant="secondary"
                    glyph="⏮"
                    onClick={stop(() => onReplay(run.runId))}
                  >
                    Replay
                  </Button>
                )}
                {actions.openLive && (
                  <Button
                    size="sm"
                    variant="primary"
                    glyph="▸"
                    onClick={stop(() => onOpenLive(run.runId))}
                  >
                    Open live
                  </Button>
                )}
                {!actions.replay && !actions.openLive && <span style={tdMuted}>{EM_DASH}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
