import type { CSSProperties } from 'react';

/**
 * LineageLegend — the static key that makes the redesigned organism graph readable to a non-expert: it
 * names the NODE color-code (Seed · Mutation · Fusion · Candidate · Culled · Winner) and the EDGE styles
 * (Fusion solid violet · Mutation dashed amber · Derivation faint). Color is NEVER the sole channel —
 * each row pairs the swatch/dash sample with a glyph + a text label (rule #4 / §12). Mounted inside the
 * ReactFlow as a fixed `<Panel position="top-right">` so it stays put during pan/zoom. Tokens only.
 */

const panel: CSSProperties = {
  background: 'var(--bg-surface-2)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2)',
  display: 'grid',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
  whiteSpace: 'nowrap',
};
const heading: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--fg-default)',
};
const group: CSSProperties = { display: 'grid', gap: 'var(--space-1)' };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' };
const glyphStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  width: 'var(--space-4)',
  textAlign: 'center',
};

/** A small filled swatch in the operation hue (the node color-code sample). */
function swatch(color: string): CSSProperties {
  return {
    width: 'var(--space-3)',
    height: 'var(--space-3)',
    borderRadius: 'var(--radius-sm)',
    background: `color-mix(in srgb, ${color} 30%, var(--bg-surface-2))`,
    borderLeft: `var(--space-1) solid ${color}`,
    flex: 'none',
  };
}

interface NodeRow {
  readonly color: string;
  readonly glyph: string;
  readonly label: string;
}
// Labels are deliberately distinct from any single graph-node label (e.g. a winning candidate may be
// labelled literally "Winner") so a legend entry never collides with a node when querying by text.
const NODE_ROWS: readonly NodeRow[] = [
  { color: 'var(--status-seeded)', glyph: '◌', label: 'Seeded organism' },
  { color: 'var(--status-mutated)', glyph: '⚇', label: 'Mutated organism' },
  { color: 'var(--status-reproduced)', glyph: '⚇', label: 'Fused organism' },
  { color: 'var(--status-scored)', glyph: '◉', label: 'Candidate idea' },
  { color: 'var(--status-culled)', glyph: '✕', label: 'Culled' },
  { color: 'var(--status-selected)', glyph: '♔', label: 'Selected winner' },
];

/** A tiny inline edge sample (a colored line, optionally dashed) — the edge-style channel + label. */
function edgeSample(color: string, dashed: boolean): CSSProperties {
  return {
    width: 'var(--space-5)',
    flex: 'none',
    borderTop: `var(--space-1) ${dashed ? 'dashed' : 'solid'} ${color}`,
  };
}
interface EdgeRow {
  readonly color: string;
  readonly dashed: boolean;
  readonly label: string;
}
const EDGE_ROWS: readonly EdgeRow[] = [
  { color: 'var(--status-reproduced)', dashed: false, label: 'Fusion' },
  { color: 'var(--status-mutated)', dashed: true, label: 'Mutation' },
  { color: 'var(--border-subtle)', dashed: false, label: 'Derivation' },
];

export function LineageLegend() {
  return (
    <div style={panel} aria-label="Lineage legend">
      <div style={group}>
        <div style={heading}>Organisms</div>
        {NODE_ROWS.map((r) => (
          <div key={r.label} style={row}>
            <span style={swatch(r.color)} aria-hidden="true" />
            <span style={glyphStyle} aria-hidden="true">
              {r.glyph}
            </span>
            <span>{r.label}</span>
          </div>
        ))}
      </div>
      <div style={group}>
        <div style={heading}>Lineage</div>
        {EDGE_ROWS.map((r) => (
          <div key={r.label} style={row}>
            <span style={edgeSample(r.color, r.dashed)} aria-hidden="true" />
            <span>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
