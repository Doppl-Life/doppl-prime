import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { CSSProperties, ReactNode } from 'react';
import { StatusBadge } from '../components/core/StatusBadge';
import type { LineageNodeData } from './lineageToFlow';

/**
 * nodeTypes — the five custom React Flow node types (agenome · candidate · critic/check · score ·
 * selected-winner) + the `generation` COLUMN HEADER, each rendered via the shared accessible StatusBadge
 * primitive (shape+label+icon+color, never color alone — rule #4 / §12). The redesign COLOR-CODES the
 * node body by the operation that produced it so a non-expert reads the evolution at a glance: a seeded
 * organism, a mutation, and a fusion are each a different hue (a prominent LEFT border bar + a faint
 * tinted body via color-mix), the winner glows gold, a culled node turns red. The StatusBadge stays — color
 * is the 4th redundant channel, never the only one. The `generation` node renders as a wide header chip
 * atop its column (it keeps Handles so `spawned` edges resolve). All colors/spacing via `var()` tokens
 * (no raw hex / no raw px). Pixel-level visuals are covered by the P7.15 Playwright smoke.
 */

const card: CSSProperties = {
  background: 'var(--bg-surface-2)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-3)',
  display: 'grid',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
  minWidth: 'var(--space-8)',
  // B5 declutter: bound the node footprint so a long candidate title can't stretch the card across the
  // column gap (the layout strides a wider distance between columns — bare numeric geometry, token-exempt).
  maxWidth: 260,
  // a new node blooms in (scale + fade, slight overshoot) when it mounts — so live additions read as the
  // organism growing. Honors prefers-reduced-motion via the global base.css gate.
  animation: 'doppl-spawn var(--motion-spawn-ms) var(--ease-overshoot)',
};
const labelRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  color: 'var(--fg-default)',
  // a flex item must be allowed to shrink for its child's ellipsis to engage.
  minWidth: 0,
};
/** The node title: single-line, ellipsised; the full text rides a `title` tooltip (B5 declutter). */
const labelText: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};
const metricsRow: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
// The status row carries the live "working" beat INLINE (a pulsing ◐ beside the StatusBadge) rather than on
// its own line — so a working node is no height taller than an idle one. That keeps the layout's height
// estimate exact (no reserved "working" row, no overlap when it appears) and lets a node sit tight under
// its producer. (The working flag is merged post-layout — LineageGraph — so it MUST NOT change card height.)
const statusRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
};
const workingMark: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--status-active)',
  lineHeight: 1,
  animation: 'doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite',
};
// The column header: a PLAIN centered label (no card box / border / handles), so it reads as a section
// header for the column rather than a node. Its width matches a column's node width so the text centers
// over the organisms below it.
const headerChip: CSSProperties = {
  width: 240,
  padding: 'var(--space-1) 0',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
  textAlign: 'center',
  background: 'transparent',
};
// The generation header's edge anchor — invisible (a header shouldn't show a connector dot).
const hiddenHandle: CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 'none',
  background: 'transparent',
  pointerEvents: 'none',
};

/**
 * The OPERATION color for a node — the hue that color-codes its body (LEFT bar + tinted background):
 *   - selected winner → gold ; culled → red ; agenome by `bornBy` (seed / mutation / fusion) ;
 *     other candidates → the scored accent. (Never the sole channel — the StatusBadge glyph+label stay.)
 */
function bodyColorFor(data: LineageNodeData): string {
  if (data.nodeType === 'candidate' && data.status === 'selected') return 'var(--winner-accent)';
  if (data.status === 'culled') return 'var(--status-culled)';
  if (data.nodeType === 'agenome') {
    if (data.bornBy === 'mutation') return 'var(--status-mutated)';
    if (data.bornBy === 'fusion') return 'var(--status-reproduced)';
    return 'var(--status-seeded)'; // 'seed' or undefined
  }
  if (data.nodeType === 'candidate') return 'var(--status-scored)';
  return 'var(--border-subtle)';
}

/** The full body style for a node card: a prominent left color bar + a faint tinted body, plus the
 *  winner glow / a vivid red culled treatment. Color-coding is redundant with the StatusBadge (rule #4). */
function bodyStyle(data: LineageNodeData): CSSProperties {
  const color = bodyColorFor(data);
  const isWinner = data.nodeType === 'candidate' && data.status === 'selected';
  const isCulled = data.status === 'culled';
  return {
    ...card,
    borderLeft: `var(--space-1) solid ${color}`,
    // Culled lineages get a STRONGER red wash + a full red outline, only lightly de-emphasized — so a
    // non-expert can SEE selection killing the weak (culling is half the evolutionary signal, and the
    // old faint gray fade was too easy to miss). Live nodes keep the subtle 12% tint. The selected winner
    // gets its theme-aware fill (vibrant yellow in light) so it reads as the hero on the canvas.
    background: isWinner
      ? 'var(--winner-node-bg)'
      : `color-mix(in srgb, ${color} ${isCulled ? '24%' : '12%'}, var(--bg-surface-2))`,
    ...(isWinner ? { boxShadow: 'var(--glow-winner)' } : {}),
    ...(isCulled ? { opacity: 0.82, borderColor: color } : {}),
  };
}

/** Trim a metric to 2 decimals so a node card never prints a 17-digit float (which wraps to a second line
 *  and inflates the card height → overlap), e.g. fitness/novelty 0.45 / 1.00. */
function formatMetric(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  return v.toFixed(2);
}

/** Presentational node card (no Handle / React Flow context) — directly unit-testable. */
export function LineageNodeCard({ data }: { data: LineageNodeData }) {
  return (
    <div style={bodyStyle(data)}>
      <div style={labelRow}>
        <span style={labelText} title={data.label}>
          {data.label}
        </span>
      </div>
      {data.status !== undefined && (
        <div style={statusRow}>
          {/* pass `domain` only when defined (exactOptionalPropertyTypes); StatusBadge defaults otherwise. */}
          <StatusBadge
            {...(data.statusDomain !== undefined ? { domain: data.statusDomain } : {})}
            status={data.status}
            size="sm"
          />
          {data.working && (
            <span role="status" aria-label="working" title="working…" style={workingMark}>
              ◐
            </span>
          )}
        </div>
      )}
      {data.metrics !== undefined && (
        <div style={metricsRow}>
          {Object.entries(data.metrics).map(([k, v]) => (
            <span key={k}>
              {k} {formatMetric(v)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The generation COLUMN-HEADER chip — a wide "Generation N" pill atop its column. The ordinal comes
 *  from `generationIndex`; falls back to the projection label when absent. */
export function GenerationHeaderCard({ data }: { data: LineageNodeData }) {
  const text =
    data.generationIndex !== undefined ? `Generation ${data.generationIndex}` : data.label;
  return <div style={headerChip}>{text}</div>;
}

/** A custom node = source/target handles wrapping the presentational card (the React Flow contract). Four
 *  INVISIBLE anchors (no connector dots on a read-only graph): left/right carry the horizontal cross-
 *  generation breeding edges; top/bottom carry the SHORT vertical agenome→candidate connector within a
 *  column. Edges pick their anchor via sourceHandle/targetHandle (see lineageToFlow). */
function withHandles(card: ReactNode) {
  return (
    <>
      <Handle id="tl" type="target" position={Position.Left} style={hiddenHandle} />
      <Handle id="tt" type="target" position={Position.Top} style={hiddenHandle} />
      {card}
      <Handle id="sr" type="source" position={Position.Right} style={hiddenHandle} />
      <Handle id="sb" type="source" position={Position.Bottom} style={hiddenHandle} />
    </>
  );
}

// React Flow calls each custom node with NodeProps over the generic Node; we cast `data` to our typed
// payload (avoids the NodeProps generic-variance friction with the NodeTypes map).
export function AgenomeNode({ data }: NodeProps) {
  return withHandles(<LineageNodeCard data={data as LineageNodeData} />);
}
export function CandidateNode({ data }: NodeProps) {
  return withHandles(<LineageNodeCard data={data as LineageNodeData} />);
}
export function CriticCheckNode({ data }: NodeProps) {
  return withHandles(<LineageNodeCard data={data as LineageNodeData} />);
}
export function ScoreNode({ data }: NodeProps) {
  return withHandles(<LineageNodeCard data={data as LineageNodeData} />);
}
export function SelectedWinnerNode({ data }: NodeProps) {
  return withHandles(<LineageNodeCard data={data as LineageNodeData} />);
}
/** The generation tier — a plain column header. It only ever SOURCES the faint `spawned` edge to the
 *  first agenome, anchored by a single invisible handle at its bottom-center (no visible connector dot). */
export function GenerationNode({ data }: NodeProps) {
  return (
    <>
      <GenerationHeaderCard data={data as LineageNodeData} />
      <Handle type="source" position={Position.Bottom} style={hiddenHandle} />
    </>
  );
}

/** The stable nodeTypes map passed to <ReactFlow> (must be a module constant — RF warns otherwise). */
export const lineageNodeTypes = {
  generation: GenerationNode,
  agenome: AgenomeNode,
  candidate: CandidateNode,
  criticCheck: CriticCheckNode,
  score: ScoreNode,
  selectedWinner: SelectedWinnerNode,
} as const;
