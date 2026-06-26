import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { CSSProperties, ReactNode } from 'react';
import type { KnowledgeNodeData } from './knowledgeToFlow';

/**
 * nodeTypes — the three custom React Flow node types for the knowledge graph: a GENERATION column header,
 * an AGENOME hub (the agent that left the research traces), and a research NOTE leaf. The note is
 * color-coded by which research TOOL produced it (web / X / YouTube / fetch) — but never by color alone:
 * the tool NAME (text) + a glyph ride alongside the hue (rule #4 / §12). All colors/spacing via `var()`
 * tokens (no raw hex / no raw px); bare numeric geometry (max widths / line clamps) is layout, token-exempt.
 */

/** Tool → accessible encoding: a hue token + a glyph + the readable tool label (color is redundant). */
const TOOL_ENCODING: Record<string, { color: string; glyph: string; label: string }> = {
  web_search: { color: 'var(--status-scored)', glyph: '🌐', label: 'web' },
  x_search: { color: 'var(--status-reproduced)', glyph: '𝕏', label: 'X' },
  // cyan, NOT --status-culled — red is reserved exclusively for the graveyard (dead-end) treatment so a
  // live YouTube note is never visually mistaken for culled research.
  youtube_search: { color: 'var(--status-active)', glyph: '▶', label: 'YouTube' },
  fetch_url: { color: 'var(--status-mutated)', glyph: '🔗', label: 'fetch' },
};
function toolEncoding(toolName: string | undefined): {
  color: string;
  glyph: string;
  label: string;
} {
  return (
    (toolName !== undefined ? TOOL_ENCODING[toolName] : undefined) ?? {
      color: 'var(--border-strong)',
      glyph: '•',
      label: toolName ?? 'tool',
    }
  );
}

const noteCard: CSSProperties = {
  background: 'var(--bg-surface-2)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-3)',
  display: 'grid',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
  width: 240,
};
const toolRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  fontWeight: 700,
  letterSpacing: '0.03em',
};
const queryText: CSSProperties = {
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};
const snippetText: CSSProperties = {
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};
const sourceRow: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const hubCard: CSSProperties = {
  background: 'var(--bg-surface-2)',
  borderRadius: 'var(--radius-md)',
  borderLeft: 'var(--space-1) solid var(--status-active)',
  border: 'thin solid var(--border-subtle)',
  padding: 'var(--space-2) var(--space-3)',
  display: 'grid',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-mono)',
  fontWeight: 700,
  color: 'var(--fg-default)',
  minWidth: 'var(--space-8)',
};
const hubCount: CSSProperties = {
  fontSize: 'var(--text-caption)',
  fontWeight: 400,
  color: 'var(--fg-muted)',
};
/** A culled lineage (dead-end research) — a red treatment + the "✕ culled" label (never color alone). */
const culledTag: CSSProperties = {
  fontWeight: 700,
  color: 'var(--status-culled)',
  letterSpacing: '0.03em',
};
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

/** Presentational research-note card (no Handle / RF context) — directly unit-testable. */
export function ResearchNoteCard({ data }: { data: KnowledgeNodeData }) {
  const tool = toolEncoding(data.toolName);
  const culled = data.culled === true; // research from a culled (dead-end) lineage
  const accent = culled ? 'var(--status-culled)' : tool.color;
  const sources = data.sourceUrls?.length ?? 0;
  return (
    <div
      style={{
        ...noteCard,
        borderLeft: `var(--space-1) solid ${accent}`,
        background: `color-mix(in srgb, ${accent} ${culled ? '16%' : '10%'}, var(--bg-surface-2))`,
        ...(culled ? { opacity: 0.9 } : {}),
      }}
    >
      <div style={{ ...toolRow, color: accent }}>
        <span aria-hidden="true">{tool.glyph}</span>
        <span>{tool.label}</span>
        {culled && <span style={culledTag}>✕ dead end</span>}
      </div>
      {data.query !== undefined && (
        <span style={queryText} title={data.query}>
          {data.query}
        </span>
      )}
      {data.snippet !== undefined && <div style={snippetText}>{data.snippet}</div>}
      {sources > 0 && (
        <div style={sourceRow}>
          {sources} source{sources === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}

/** Presentational agenome-hub card — the agent that left the research traces, its note count, and (for a
 *  culled lineage) the dead-end marker + its cull score. */
export function AgenomeHubCard({ data }: { data: KnowledgeNodeData }) {
  const culled = data.culled === true;
  return (
    <div
      style={{
        ...hubCard,
        ...(culled
          ? {
              borderLeft: 'var(--space-1) solid var(--status-culled)',
              background: 'color-mix(in srgb, var(--status-culled) 16%, var(--bg-surface-2))',
              opacity: 0.9,
            }
          : {}),
      }}
    >
      <span title={data.label}>{data.label}</span>
      <span style={hubCount}>
        {data.noteCount !== undefined && (
          <>
            {data.noteCount} note{data.noteCount === 1 ? '' : 's'}
          </>
        )}
        {culled && (
          <span
            style={culledTag}
            title={
              data.score !== undefined
                ? `culled by selection at fitness ${data.score.toFixed(2)}`
                : 'culled by selection'
            }
          >
            {' · ✕ culled'}
            {data.score !== undefined ? ` ${data.score.toFixed(2)}` : ''}
          </span>
        )}
      </span>
    </div>
  );
}

/** The generation COLUMN-HEADER chip. */
export function GenerationHeaderCard({ data }: { data: KnowledgeNodeData }) {
  return <div style={headerChip}>{data.label}</div>;
}

function withHandles(card: ReactNode) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      {card}
      <Handle type="source" position={Position.Right} />
    </>
  );
}

export function GenerationNode({ data }: NodeProps) {
  return withHandles(<GenerationHeaderCard data={data as KnowledgeNodeData} />);
}
export function AgenomeHubNode({ data }: NodeProps) {
  return withHandles(<AgenomeHubCard data={data as KnowledgeNodeData} />);
}
export function ResearchNoteNode({ data }: NodeProps) {
  return withHandles(<ResearchNoteCard data={data as KnowledgeNodeData} />);
}

/** The stable nodeTypes map passed to <ReactFlow> (must be a module constant — RF warns otherwise). */
export const knowledgeNodeTypes = {
  generation: GenerationNode,
  agenome: AgenomeHubNode,
  note: ResearchNoteNode,
} as const;
