import type { CSSProperties, ReactNode } from 'react';

/**
 * ToolCallResult — readable rendering of a tool call's query + result (FB.7) in the node inspector.
 * The persisted result is markdown-ish search text (bold, an inline numbered list, and `[label](url)`
 * links) that otherwise reads as one undifferentiated wall. A tiny, dependency-free formatter promotes
 * the numbered items to a real list, renders bold + shortened clickable links, and spaces paragraphs.
 * Display-only (rule #6) — it reformats the verbatim scrubbed text, never rewrites it. Tokens only.
 */
export interface ToolCallResultProps {
  query?: string | undefined;
  result?: string | undefined;
}

const queryRow: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'baseline',
  marginBottom: 'var(--space-2)',
};
const qLabel: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
  flexShrink: 0,
};
const qVal: CSSProperties = { fontSize: 'var(--text-label)', color: 'var(--fg-default)' };
const resultBox: CSSProperties = {
  fontSize: 'var(--text-label)',
  color: 'var(--fg-default)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-3)',
  maxHeight: '22rem',
  overflow: 'auto',
};
const para: CSSProperties = { margin: 0, marginBottom: 'var(--space-2)', lineHeight: 1.6 };
const li: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  marginBottom: 'var(--space-2)',
  lineHeight: 1.6,
};
const liNum: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  color: 'var(--accent)',
  flexShrink: 0,
};
const link: CSSProperties = {
  color: 'var(--accent)',
  textDecoration: 'underline',
  wordBreak: 'break-word',
};

/** The query is persisted as a JSON envelope (`{"query":"…"}`) — unwrap to the bare string when we can. */
function unwrapQuery(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && 'query' in parsed) {
      const q = (parsed as { query: unknown }).query;
      if (typeof q === 'string') return q;
    }
  } catch {
    // not JSON — fall through to the raw text
  }
  return raw;
}

const INLINE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*/g;

/** Render inline bold (`**…**`) and `[label](url)` links; everything else is plain text. */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  const pushText = (s: string) => {
    if (s.length > 0) nodes.push(<span key={`${keyBase}-t${k++}`}>{s}</span>);
  };
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    pushText(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(
        <a key={`${keyBase}-${k++}`} href={m[2]} target="_blank" rel="noreferrer" style={link}>
          {m[1]}
        </a>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={`${keyBase}-${k++}`}>{m[3]}</strong>);
    }
    last = INLINE.lastIndex;
  }
  pushText(text.slice(last));
  return nodes;
}

/** Break the blob into paragraphs + numbered list items (markers may sit inline in the source). */
function renderBlocks(text: string): ReactNode[] {
  const normalized = text.replace(/\s+(?=\d+\.\s)/g, '\n');
  const lines = normalized
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.map((line, i) => {
    const m = /^(\d+)\.\s+(.*)$/.exec(line);
    if (m !== null) {
      const num = m[1] ?? '';
      const body = m[2] ?? '';
      return (
        <div key={i} style={li}>
          <span style={liNum}>{num}.</span>
          <span>{renderInline(body, `l${i}`)}</span>
        </div>
      );
    }
    return (
      <p key={i} style={para}>
        {renderInline(line, `p${i}`)}
      </p>
    );
  });
}

export function ToolCallResult({ query, result }: ToolCallResultProps) {
  return (
    <>
      {query !== undefined && (
        <div style={queryRow}>
          <span style={qLabel}>query</span>
          <span style={qVal}>{unwrapQuery(query)}</span>
        </div>
      )}
      {result !== undefined && <div style={resultBox}>{renderBlocks(result)}</div>}
    </>
  );
}
