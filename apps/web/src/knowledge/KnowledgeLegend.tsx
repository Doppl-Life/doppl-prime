import type { CSSProperties } from 'react';

/**
 * KnowledgeLegend — a fixed key for the knowledge graph: which hue marks which research tool (encoded
 * also by glyph + label, never color alone — rule #4 / §12). Mirrors the LineageLegend panel.
 */

const panel: CSSProperties = {
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2)',
  display: 'grid',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' };
const swatch = (color: string): CSSProperties => ({
  width: 'var(--space-3)',
  height: 'var(--space-2)',
  borderRadius: 'var(--radius-sm)',
  background: color,
  flexShrink: 0,
});

const TOOLS: { color: string; glyph: string; label: string }[] = [
  { color: 'var(--status-scored)', glyph: '🌐', label: 'web_search' },
  { color: 'var(--status-reproduced)', glyph: '𝕏', label: 'x_search' },
  { color: 'var(--status-active)', glyph: '▶', label: 'youtube_search' },
  { color: 'var(--status-mutated)', glyph: '🔗', label: 'fetch_url' },
];

export function KnowledgeLegend() {
  return (
    <div style={panel} aria-label="Knowledge graph legend">
      {TOOLS.map((tool) => (
        <div key={tool.label} style={row}>
          <span style={swatch(tool.color)} aria-hidden="true" />
          <span aria-hidden="true">{tool.glyph}</span>
          <span>{tool.label}</span>
        </div>
      ))}
      {/* the in-run stigmergy READ: an agent retrieving (following) a prior agent's research */}
      <div style={row}>
        <span style={swatch('var(--status-active)')} aria-hidden="true" />
        <span aria-hidden="true">⤳</span>
        <span>retrieved (reads prior research)</span>
      </div>
      {/* the graveyard: research from a culled (dead-end) lineage */}
      <div style={row}>
        <span style={swatch('var(--status-culled)')} aria-hidden="true" />
        <span aria-hidden="true">✕</span>
        <span>culled (dead end)</span>
      </div>
    </div>
  );
}
