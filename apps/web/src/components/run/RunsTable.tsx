import { Fragment, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { Button, StatusBadge } from '../ds';
import { resolveStatus } from '../core/status-map';
import type { RunSummary } from '../../data/runClient';
import { DEFAULT_SORT, failedBeforeGenerating, groupRunsByDay, timeOfDay } from './runsSummary';
import type { RunGroup, SortKey, SortState } from './runsSummary';
import { Sparkline } from './Sparkline';
import { RunPeek } from './RunPeek';

/**
 * RunsTable (S0 Runs home) — the date-grouped runs table. Rows are bucketed under day headers
 * ("Today" / "Yesterday" / "Jun 24") to cut the repeated-timestamp noise; each row carries a
 * status-colored accent bar (a redundant, scannable channel alongside the StatusBadge label — never
 * color alone, rule #4), the problem + final idea, a fitness sparkline of the per-generation climb, a
 * compact activity readout, and a status-derived action (Replay for terminal runs, Open live for
 * running ones). A live run's accent breathes via the shared liveness pulse; sortable headers reorder
 * the list (a non-default sort flattens the day grouping) and a chevron expands an inline RunPeek
 * drawer. Pure presentation over the enriched RunSummary; read-only (rule #2). Tokens only.
 */
export interface RunsTableProps {
  runs: readonly RunSummary[];
  onReplay: (runId: string) => void;
  onOpenLive: (runId: string) => void;
  /** Current sort + a click handler for the sortable headers. Defaults to the natural newest-first order. */
  sort?: SortState;
  onSort?: (key: SortKey) => void;
  /** Day-group the rows (the default newest-first view). A non-default sort renders a flat list. */
  grouped?: boolean;
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
const sortBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
};
const sortArrow: CSSProperties = { fontSize: 'var(--text-mono)', color: 'var(--accent)' };
// the expanded peek fills its whole cell with the LIGHTEST raised surface (--bg-overlay is lighter than the
// table panel in dark, and white in light) so the detail reads as its own lighter band, not a bleed of the
// row above it.
const peekTd: CSSProperties = { padding: 0 };
// the expand animation: a 1-row grid whose track grows 0fr→1fr (animates the exact content height) while
// the clipped child fades in — so the row slides open instead of snapping.
const peekGrid: CSSProperties = {
  display: 'grid',
  gridTemplateRows: '1fr',
  animationDuration: 'var(--motion-slow)',
  animationTimingFunction: 'var(--ease-out)',
};
// the clipped grid item must be BARE (no padding/border) so the 0fr track collapses it to a true 0 —
// padding/border on this element can't shrink and would leave a residual that snaps away on unmount.
const peekClip: CSSProperties = {
  overflow: 'hidden',
  minHeight: 0,
};
// the actual visible band: bg + border + padding live here, on a normal block that gets clipped.
const peekContent: CSSProperties = {
  padding: 'var(--space-4)',
  background: 'var(--bg-overlay)',
  borderBottom: 'thin solid var(--border-subtle)',
};
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
const idText: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: 'var(--fg-muted)',
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

export function RunsTable({
  runs,
  onReplay,
  onOpenLive,
  sort = DEFAULT_SORT,
  onSort,
  grouped = true,
}: RunsTableProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Rows mid-collapse stay rendered (still in `expanded`) so the collapse animation can play; they're
  // dropped on its animationend (finishCollapse).
  const [collapsing, setCollapsing] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => {
    if (collapsing.has(id)) {
      // clicked again mid-collapse → cancel it and stay open
      setCollapsing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else if (expanded.has(id)) {
      setCollapsing((prev) => new Set(prev).add(id)); // begin the collapse animation
    } else {
      setExpanded((prev) => new Set(prev).add(id)); // open (expand animation)
    }
  };
  const finishCollapse = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setCollapsing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  const stop = (cb: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    cb();
  };
  const groups: RunGroup[] = grouped
    ? groupRunsByDay(runs)
    : [{ label: '', rows: runs.map((run, i) => ({ run, index: i + 1 })) }];

  const sortableTh = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => {
    const active = sort.key === key;
    const ariaSort: 'ascending' | 'descending' | 'none' = active
      ? sort.dir === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none';
    return (
      <th style={align === 'right' ? thRight : th} aria-sort={ariaSort}>
        <button
          type="button"
          style={sortBtn}
          onClick={() => onSort?.(key)}
          aria-label={`Sort by ${label}`}
        >
          {label}
          {active && (
            <span style={sortArrow} aria-hidden="true">
              {sort.dir === 'asc' ? '▲' : '▼'}
            </span>
          )}
        </button>
      </th>
    );
  };

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
          {sortableTh('Time', 'time')}
          {sortableTh('Problem', 'problem')}
          <th style={th}>Final idea</th>
          {sortableTh('Status', 'status')}
          {sortableTh('Progress', 'cands')}
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
            expanded={expanded}
            collapsing={collapsing}
            onToggle={toggle}
            onFinishCollapse={finishCollapse}
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
  expanded,
  collapsing,
  onToggle,
  onFinishCollapse,
  onReplay,
  onOpenLive,
  stop,
}: {
  label: string;
  rows: ReturnType<typeof groupRunsByDay>[number]['rows'];
  hovered: string | null;
  setHovered: (id: string | null) => void;
  expanded: ReadonlySet<string>;
  collapsing: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onFinishCollapse: (id: string) => void;
  onReplay: (runId: string) => void;
  onOpenLive: (runId: string) => void;
  stop: (cb: () => void) => (e: MouseEvent) => void;
}) {
  return (
    <>
      {label !== '' && (
        <tr>
          <td style={groupHeaderTd} colSpan={COL_COUNT}>
            {label}
          </td>
        </tr>
      )}
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
        const isExpanded = expanded.has(run.runId); // peek is rendered (incl. while collapsing)
        const isClosing = collapsing.has(run.runId);
        const isOpen = isExpanded && !isClosing; // the intended open state (drives the aria toggle)
        return (
          <Fragment key={run.runId}>
            <tr
              style={rowStyle}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              aria-label={
                isOpen
                  ? `Collapse detail for run ${run.runId}`
                  : `Expand detail for run ${run.runId}`
              }
              onMouseEnter={() => setHovered(run.runId)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onToggle(run.runId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(run.runId);
                }
              }}
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
                <span style={idText} title={run.runId}>
                  {shortId(run.runId)}
                </span>
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
                  <div
                    style={clamp}
                    title={run.finalIdeaSummary ?? run.finalIdeaTitle ?? undefined}
                  >
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
                      color="var(--mode-replay)"
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
                    style={{
                      background: 'transparent',
                      color: 'var(--mode-replay)',
                      border: 'thin solid var(--mode-replay)',
                    }}
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
            {isExpanded && (
              <tr>
                <td colSpan={COL_COUNT} style={peekTd}>
                  <div
                    data-testid={`run-peek-${run.runId}`}
                    style={{
                      ...peekGrid,
                      animationName: isClosing ? 'doppl-row-collapse' : 'doppl-row-expand',
                      // close uses an ease-IN curve (accelerates to a quick finish) so the table's
                      // per-frame reflow doesn't crawl/step at the very end; open keeps peekGrid's ease-out.
                      ...(isClosing
                        ? {
                            animationName: 'doppl-row-collapse',
                            animationDuration: 'var(--motion-base)',
                            animationTimingFunction: 'linear',
                            animationFillMode: 'forwards',
                          }
                        : {}),
                    }}
                    onAnimationEnd={() => {
                      if (isClosing) onFinishCollapse(run.runId);
                    }}
                  >
                    <div style={peekClip}>
                      <div style={peekContent}>
                        <RunPeek run={run} />
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
