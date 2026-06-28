import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { BloomNodeData } from './caseStudyToFlow';
import './bloom.css';

/**
 * nodeTypes — the three custom React Flow node types for the Islands bloom: the case-study ROOT (the seed the
 * network grows from), a RUN hub (one execution against the case study), and a DOPPEL petal (a crowned
 * winner). Each pops in staggered by `growOrder` (the "growing" feel) and the root/petals glow (the wow). All
 * colors/spacing via `var()` tokens (no raw hex / no raw px); bare numeric geometry (widths / clamps) is
 * layout, token-exempt. Status rides shape + label + a colored ring, never color alone (rule #4 / §12).
 */

/** Stagger the grow-in by the node's order so the bloom unfurls root → runs → petals. */
function growDelay(growOrder: number): CSSProperties {
  return { animationDelay: `${growOrder * 90}ms` };
}

const rootCard: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-1)',
  placeItems: 'center',
  textAlign: 'center',
  width: 200,
  padding: 'var(--space-4)',
  borderRadius: 'var(--radius-pill, 999px)',
  background: 'radial-gradient(circle at 50% 35%, var(--bg-surface-2), var(--bg-surface))',
  border: 'thin solid var(--accent)',
  color: 'var(--fg-default)',
  fontFamily: 'var(--font-ui)',
};
const rootKicker: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  fontWeight: 700,
};
const rootTitle: CSSProperties = {
  fontWeight: 800,
  fontSize: 'var(--text-h3)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  lineHeight: 1.2,
};
const rootMeta: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};

const runCard: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-1)',
  width: 260,
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-surface-2)',
  border: 'thin solid var(--border-subtle)',
  borderLeft: 'var(--space-1) solid var(--accent)',
  color: 'var(--fg-default)',
  fontFamily: 'var(--font-ui)',
  boxShadow: '0 0 14px color-mix(in srgb, var(--accent) 14%, transparent)',
};
const runKicker: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
  fontWeight: 700,
  letterSpacing: '0.04em',
};
const runTitle: CSSProperties = {
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
};

const petalCard: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-1)',
  width: 240,
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-lg, 14px)',
  background:
    'linear-gradient(135deg, color-mix(in srgb, var(--status-selected) 22%, var(--bg-surface-2)), var(--bg-surface-2))',
  border: 'thin solid var(--status-selected)',
  color: 'var(--fg-default)',
  fontFamily: 'var(--font-ui)',
};
const petalKicker: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--status-selected)',
  fontWeight: 700,
  letterSpacing: '0.06em',
};
const petalTitle: CSSProperties = {
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
};
const petalSummary: CSSProperties = {
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const handleHidden: CSSProperties = { opacity: 0, border: 'none', background: 'transparent' };

function CaseStudyRootNode({ data }: NodeProps) {
  const d = data as BloomNodeData;
  return (
    <div className="bloom-node bloom-root" style={{ ...rootCard, ...growDelay(d.growOrder) }}>
      <div style={rootKicker}>Case study</div>
      <div style={rootTitle} title={d.label}>
        {d.label}
      </div>
      <div style={rootMeta}>
        {d.runCount ?? 0} run{(d.runCount ?? 0) === 1 ? '' : 's'} · {d.doppelCount ?? 0} doppel
        {(d.doppelCount ?? 0) === 1 ? '' : 's'}
      </div>
      <Handle type="source" position={Position.Right} style={handleHidden} />
    </div>
  );
}

function RunHubNode({ data }: NodeProps) {
  const d = data as BloomNodeData;
  return (
    <div className="bloom-node" style={{ ...runCard, ...growDelay(d.growOrder) }}>
      <div style={runKicker}>
        <span>◆ run</span>
        <span>{d.status ?? '—'}</span>
      </div>
      <div style={runTitle} title={d.label}>
        {d.label}
      </div>
      <div style={rootMeta}>
        {d.doppelCount ?? 0} doppel{(d.doppelCount ?? 0) === 1 ? '' : 's'}
      </div>
      <Handle type="target" position={Position.Left} style={handleHidden} />
      <Handle type="source" position={Position.Right} style={handleHidden} />
    </div>
  );
}

function DoppelLeafNode({ data }: NodeProps) {
  const d = data as BloomNodeData;
  return (
    <div className="bloom-node bloom-petal" style={{ ...petalCard, ...growDelay(d.growOrder) }}>
      <div style={petalKicker}>✦ doppel</div>
      <div style={petalTitle} title={d.label}>
        {d.label}
      </div>
      {d.summary !== undefined && d.summary.length > 0 && (
        <div style={petalSummary}>{d.summary}</div>
      )}
      <Handle type="target" position={Position.Left} style={handleHidden} />
    </div>
  );
}

/** Module constant (React Flow warns if nodeTypes is a new object each render). */
export const bloomNodeTypes = {
  caseStudy: CaseStudyRootNode,
  run: RunHubNode,
  doppel: DoppelLeafNode,
};
