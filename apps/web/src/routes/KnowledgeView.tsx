import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { RunClient } from '../data/runClient';
import type { KnowledgeGraph as KnowledgeGraphData } from '../data/knowledge';
import { KnowledgeGraph } from '../knowledge/KnowledgeGraph';

/**
 * KnowledgeView — the route screen for the Knowledge-Evolution graph (`/runs/:id/knowledge`). Fetches the
 * ResearchNote projection (`getKnowledge`) and renders the `<KnowledgeGraph>`; re-fetches on an interval so
 * a LIVE run's knowledge grows in place (rebuild-on-read, the same cadence idea as the lineage view, LESSONS
 * §13). Read-only — it issues no commands (safety rule #2). The poll interval is injectable (0 → off) so
 * tests stay timer-free.
 */
export interface KnowledgeViewProps {
  runId: string;
  runClient: RunClient;
  /** Poll cadence (ms) to re-fetch the growing graph. Default 4s; 0 disables (tests). */
  refreshMs?: number;
}

const DEFAULT_REFRESH_MS = 4000;

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  marginBottom: 'var(--space-3)',
};
const title: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-h2)',
  fontWeight: 700,
  color: 'var(--fg-default)',
};
const runIdStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const link: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--accent)',
};
const message: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  padding: 'var(--space-4)',
};

export function KnowledgeView({
  runId,
  runClient,
  refreshMs = DEFAULT_REFRESH_MS,
}: KnowledgeViewProps) {
  const [graph, setGraph] = useState<KnowledgeGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchGraph = (): void => {
      runClient
        .getKnowledge(runId)
        .then((next) => {
          if (!active) return;
          setGraph(next);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!active) return;
          setError(cause instanceof Error ? cause.message : 'failed to load the knowledge graph');
        });
    };
    fetchGraph();
    const interval = refreshMs > 0 ? setInterval(fetchGraph, refreshMs) : undefined;
    return () => {
      active = false;
      if (interval !== undefined) clearInterval(interval);
    };
  }, [runId, runClient, refreshMs]);

  return (
    <div>
      <div style={header}>
        <div>
          <div style={title}>Knowledge evolution</div>
          <div style={runIdStyle}>run {runId}</div>
        </div>
        <Link to={`/runs/${runId}`} style={link}>
          ← organism view
        </Link>
      </div>

      {error !== null && graph === null && (
        <div role="alert" style={message}>
          Could not load the knowledge graph: {error}
        </div>
      )}
      {graph === null && error === null && <div style={message}>Loading research…</div>}
      {graph !== null && <KnowledgeGraph graph={graph} />}
    </div>
  );
}
