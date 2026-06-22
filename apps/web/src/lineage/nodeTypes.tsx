import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { CSSProperties } from 'react';
import { StatusBadge } from '../components/core/StatusBadge';
import type { LineageNodeData } from './lineageToFlow';

/**
 * nodeTypes — the five custom React Flow node types (agenome · candidate · critic/check · score ·
 * selected-winner) + the `generation` backbone, each rendered via the shared accessible StatusBadge
 * primitive (shape+label+icon+color, never color alone — rule #4 / §12). PORTED from the prototype's
 * organism-view visual vocabulary (TS-strict, NOT a `.jsx` import — LESSONS §3): the winner gets the
 * gold ♔ emphasis, working nodes get a live accent. Adherence: all colors/spacing via `var()` tokens
 * (no raw hex / no raw px). The pixel-level visuals are covered by the P7.15 Playwright smoke.
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
};
const labelRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  color: 'var(--fg-default)',
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

/** The accent border color for a node card: winner gold · working live · else subtle. */
function accentFor(data: LineageNodeData): string {
  if (data.nodeType === 'candidate' && data.status === 'selected') return 'var(--status-selected)';
  if (data.working) return 'var(--status-active)';
  return 'var(--border-subtle)';
}

/** Presentational node card (no Handle / React Flow context) — directly unit-testable. */
export function LineageNodeCard({ data }: { data: LineageNodeData }) {
  return (
    <div style={{ ...card, borderColor: accentFor(data) }}>
      <div style={labelRow}>
        <span>{data.label}</span>
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

/** A custom node = source/target handles wrapping the presentational card (the React Flow contract). */
function withHandles(data: LineageNodeData) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <LineageNodeCard data={data} />
      <Handle type="source" position={Position.Right} />
    </>
  );
}

// React Flow calls each custom node with NodeProps over the generic Node; we cast `data` to our typed
// payload (avoids the NodeProps generic-variance friction with the NodeTypes map).
export function AgenomeNode({ data }: NodeProps) {
  return withHandles(data as LineageNodeData);
}
export function CandidateNode({ data }: NodeProps) {
  return withHandles(data as LineageNodeData);
}
export function CriticCheckNode({ data }: NodeProps) {
  return withHandles(data as LineageNodeData);
}
export function ScoreNode({ data }: NodeProps) {
  return withHandles(data as LineageNodeData);
}
export function SelectedWinnerNode({ data }: NodeProps) {
  return withHandles(data as LineageNodeData);
}
/** The generation tier backbone — a minimal marker node (keeps `spawned` edges resolving). */
export function GenerationNode({ data }: NodeProps) {
  return withHandles(data as LineageNodeData);
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
