import { useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { Button, StatusBadge } from '../ds';
import { resolveStatus } from '../core/status-map';
import type { RunSummary } from '../../data/runClient';
import { failedBeforeGenerating, groupRunsByDay, timeOfDay } from './runsSummary';
import { Sparkline } from './Sparkline';

/**
 * RunsTable (S0 Runs home) — the date-grouped runs table. Rows are bucketed under day headers
 * ("Today" / "Yesterday" / "Jun 24") to cut the repeated-timestamp noise; each row carries a
 * status-colored accent bar (a redundant, scannable channel alongside the StatusBadge label — never
 * color alone, rule #4), the problem + final idea, a candidate meter (LENGTH is the truth), a compact
 * activity readout, and a status-derived action (Replay for terminal runs, Open live for running
 * ones). A live run's accent + meter breathe via the shared liveness pulse. Pure presentation over the
 * enriched RunSummary; read-only (rule #2) — actions navigate, they never mutate. Tokens only.
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
function orDash(text: string | null | undefined): string {
  return text !== null && text !== undefined && text.length > 0 ? text : EM_DASH;
}

const table: CSSProperties = {
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-default)',
};
/** Column widths (% — token-exempt geometry): accent rail · # · id · time · problem · final idea ·
 *  status · candidate meter · activity · action. Problem + Final idea keep the lion's share. */
const COLS: readonly string[] = ['1%', '3%', '8%', '7%', '22%', '22%', '10%', '12%', '8%', '7%'];
const COL_COUNT = COLS.length;

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
const accentTd: CSSProperties = { ...td, padding: 0 };
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
/** Two-line clamp for the Problem / Final-idea title — the column is wide; the rest is on hover. */
const clamp: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  lineHeight: 1.35,
};
const failedNote: CSSProperties = { ...clamp, color: 'var(--fg-faint)', fontStyle: 'italic' };
const groupHeaderTd: CSSProperties = {
  padding: 'var(--space-4) var(--space-3) var(--space-2)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--fg-faint)',
};
const meterLabelRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: 'var(--fg-muted)',
  marginBottom: 'var(--space-1)',
};
const meterTrack: CSSProperties = {
  height: 'var(--space-1)',
  background: 'var(--meter-track)',
  borderRadius: 'var(--radius-full)',
  overflow: 'hidden',
};
const activityCell: CSSProperties = {
  ...td,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: 'var(--fg-faint)',
  whiteSpace: 'nowrap',
  letterSpacing: '0.04em',
};
const sparkRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' };
const fitVal: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: 'var(--fg-muted)',
  minWidth: '2.5rem',
  textAlign: 'right',
};

export function RunsTable({ runs, onOpen, onReplay, onOpenLive }: RunsTableProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const stop = (cb: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    cb();
  };
  const groups = groupRunsByDay(runs);

  return (
    <table style={table}>
      <colgroup>
        {COLS.map((width, i) => (
          <col key={i} style={{ width }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th style={th} aria-hidden="true" />
          <th style={thRight}>#</th>
          <th style={th}>Run</th>
          <th style={th}>Time</th>
          <th style={th}>Problem</th>
          <th style={th}>Final idea</th>
          <th style={th}>Status</th>
          <th style={th} title="generations completed · candidates created">
            Progress
          </th>
          <th style={th} title="reproductions · culls · mutations">
            Activity
          </th>
          <th style={th}>Action</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <RunGroupRows
            key={group.label}
            label={group.label}
            rows={group.rows}
            hovered={hovered}
            setHovered={setHovered}
            onOpen={onOpen}
            onReplay={onReplay}
            onOpenLive={onOpenLive}
            stop={stop}
          />
        ))}
      </tbody>
    </table>
  );
}

function RunGroupRows({
  label,
  rows,
  hovered,
  setHovered,
  onOpen,
  onReplay,
  onOpenLive,
  stop,
}: {
  label: string;
  rows: ReturnType<typeof groupRunsByDay>[number]['rows'];
  hovered: string | null;
  setHovered: (id: string | null) => void;
  onOpen: (runId: string, status: string | null) => void;
  onReplay: (runId: string) => void;
  onOpenLive: (runId: string) => void;
  stop: (cb: () => void) => (e: MouseEvent) => void;
}) {
  return (
    <>
      <tr>
        <td style={groupHeaderTd} colSpan={COL_COUNT}>
          {label}
        </td>
      </tr>
      {rows.map(({ run, index }) => {
        const actions = actionsFor(run.status);
        const spec = resolveStatus('run', run.status ?? 'unknown');
        const accentAnim = spec.pulse
          ? 'doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite'
          : undefined;
        const isHovered = hovered === run.runId;
        const rowStyle: CSSProperties = {
          cursor: 'pointer',
          background: isHovered ? 'var(--bg-surface)' : 'transparent',
        };
        const failedNoIdea = failedBeforeGenerating(run);
        const fitness = run.fitnessByGeneration ?? [];
        const lastFromSeries = fitness.length > 0 ? fitness[fitness.length - 1] : undefined;
        const lastFit = run.winnerFitness ?? lastFromSeries ?? null;
        return (
          <tr
            key={run.runId}
            style={rowStyle}
            onMouseEnter={() => setHovered(run.runId)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onOpen(run.runId, run.status)}
          >
            <td style={accentTd}>
              <div
                aria-hidden="true"
                style={{
                  width: 'var(--space-1)',
                  height: 'var(--space-5)',
                  borderRadius: 'var(--radius-full)',
                  background: spec.colorToken,
                  animation: accentAnim,
                }}
              />
            </td>
            <td style={tdNum}>{index}</td>
            <td style={td}>
              <button
                type="button"
                aria-label={`Open run ${run.runId}`}
                title={run.runId}
                style={idButton}
                onClick={stop(() => onOpen(run.runId, run.status))}
              >
                {shortId(run.runId)}
              </button>
            </td>
            <td style={tdMuted}>{timeOfDay(run.createdAt)}</td>
            <td style={td}>
              <div style={clamp} title={run.problem ?? undefined}>
                {orDash(run.problem)}
              </div>
            </td>
            <td style={td}>
              {failedNoIdea ? (
                <div style={failedNote}>Failed before generating</div>
              ) : (
                <div style={clamp} title={run.finalIdeaSummary ?? run.finalIdeaTitle ?? undefined}>
                  {orDash(run.finalIdeaTitle)}
                </div>
              )}
            </td>
            <td style={td}>
              <StatusBadge domain="run" status={run.status ?? 'unknown'} size="sm" />
            </td>
            <td style={td}>
              <div style={meterLabelRow}>
                <span>
                  <span data-testid={`run-gens-${run.runId}`}>{run.generations ?? 0}</span> gens
                </span>
                <span>
                  <span data-testid={`run-cands-${run.runId}`}>{run.candidates ?? 0}</span> cands
                </span>
              </div>
              {fitness.length > 0 ? (
                <div style={sparkRow}>
                  <Sparkline
                    values={fitness}
                    color={spec.colorToken}
                    ariaLabel={`best fitness across ${fitness.length} generation${
                      fitness.length === 1 ? '' : 's'
                    }, latest ${lastFit !== null ? lastFit.toFixed(2) : 'unavailable'}`}
                  />
                  {lastFit !== null && <span style={fitVal}>{lastFit.toFixed(2)}</span>}
                </div>
              ) : (
                <div style={meterTrack} aria-hidden="true" />
              )}
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
    </>
  );
}
