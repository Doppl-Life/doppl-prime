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
 * tinted body via color-mix), the winner glows gold, a culled node fades. The StatusBadge stays — color
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
const workingRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--status-active)',
};
/** The column-header chip: a wide pill with a top accent, mono label — visually a header, not a card. */
const headerChip: CSSProperties = {
  background: 'var(--bg-surface-2)',
  border: 'thin solid var(--border-subtle)',
  borderTop: 'var(--space-1) solid var(--status-active)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--fg-default)',
  textAlign: 'center',
  minWidth: 'var(--space-9)',
};

/**
 * The OPERATION color for a node — the hue that color-codes its body (LEFT bar + tinted background):
 *   - selected winner → gold ; culled → gray ; agenome by `bornBy` (seed / mutation / fusion) ;
 *     other candidates → the scored accent. (Never the sole channel — the StatusBadge glyph+label stay.)
 */
function bodyColorFor(data: LineageNodeData): string {
  if (data.nodeType === 'candidate' && data.status === 'selected') return 'var(--status-selected)';
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
 *  winner glow / culled fade. Color-coding is redundant with the StatusBadge (rule #4). */
function bodyStyle(data: LineageNodeData): CSSProperties {
  const color = bodyColorFor(data);
  const isWinner = data.nodeType === 'candidate' && data.status === 'selected';
  const isCulled = data.status === 'culled';
  return {
    ...card,
    borderLeft: `var(--space-1) solid ${color}`,
    background: `color-mix(in srgb, ${color} 12%, var(--bg-surface-2))`,
    ...(isWinner ? { boxShadow: 'var(--glow-winner)' } : {}),
    ...(isCulled ? { opacity: 0.55 } : {}),
  };
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
        // pass `domain` only when defined (exactOptionalPropertyTypes); StatusBadge defaults otherwise.
        <StatusBadge
          {...(data.statusDomain !== undefined ? { domain: data.statusDomain } : {})}
          status={data.status}
          size="sm"
        />
      )}
      {data.metrics !== undefined && (
        <div style={metricsRow}>
          {Object.entries(data.metrics).map(([k, v]) => (
            <span key={k}>
              {k} {v}
            </span>
          ))}
        </div>
      )}
      {data.working && (
        <div role="status" style={workingRow}>
          <span aria-hidden="true">◐</span> working…
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

/** A custom node = source/target handles wrapping the presentational card (the React Flow contract). */
function withHandles(card: ReactNode) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      {card}
      <Handle type="source" position={Position.Right} />
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
/** The generation tier — a column-header chip. Still has the Handles so `spawned` edges resolve. */
export function GenerationNode({ data }: NodeProps) {
  return withHandles(<GenerationHeaderCard data={data as LineageNodeData} />);
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
