import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { RunClient } from '../data/runClient';
import type { CaseStudyGraph } from '../data/caseStudy';
import { CaseStudyBloom } from '../caseStudy/CaseStudyBloom';

/**
 * CaseStudyBloomView — the route screen for the Islands bloom (`/case-studies/:id`). Fetches the cross-run
 * case-study graph (`getCaseStudyGraph`) and renders the `<CaseStudyBloom>`; re-fetches on an interval so a
 * live case study's bloom grows in place (rebuild-on-read, the same cadence as the knowledge view, LESSONS
 * §13). Read-only — issues no commands (safety rule #2). The poll interval is injectable (0 → off) so tests
 * stay timer-free.
 */
export interface CaseStudyBloomViewProps {
  caseStudyId: string;
  runClient: RunClient;
  /** Poll cadence (ms) to re-fetch the growing bloom. Default 4s; 0 disables (tests). */
  refreshMs?: number;
}

const DEFAULT_REFRESH_MS = 4000;

const APP_HEADER_H = 'calc(var(--space-3) + var(--space-3) + var(--text-h3-lh))';
const shell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-5) var(--space-4) var(--space-4)',
  height: `calc(100vh - ${APP_HEADER_H})`,
  minHeight: 0,
  boxSizing: 'border-box',
  overflow: 'hidden',
};
const header: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  flexShrink: 0,
};
const graphRegion: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
};
const title: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-h2)',
  fontWeight: 700,
  color: 'var(--fg-default)',
};
const idStyle: CSSProperties = {
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

export function CaseStudyBloomView({
  caseStudyId,
  runClient,
  refreshMs = DEFAULT_REFRESH_MS,
}: CaseStudyBloomViewProps) {
  const [graph, setGraph] = useState<CaseStudyGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchGraph = (): void => {
      runClient
        .getCaseStudyGraph(caseStudyId)
        .then((next) => {
          if (!active) return;
          setGraph(next);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!active) return;
          setError(cause instanceof Error ? cause.message : 'failed to load the case study bloom');
        });
    };
    fetchGraph();
    const interval = refreshMs > 0 ? setInterval(fetchGraph, refreshMs) : undefined;
    return () => {
      active = false;
      if (interval !== undefined) clearInterval(interval);
    };
  }, [caseStudyId, runClient, refreshMs]);

  return (
    <div style={shell}>
      <div style={header}>
        <div>
          <div style={title}>Case study bloom</div>
          <div style={idStyle}>case study {caseStudyId}</div>
        </div>
        <Link to="/" style={link}>
          ← all runs
        </Link>
      </div>

      <div style={graphRegion}>
        {error !== null && graph === null && (
          <div role="alert" style={message}>
            Could not load the bloom: {error}
          </div>
        )}
        {graph === null && error === null && <div style={message}>Loading bloom…</div>}
        {graph !== null && <CaseStudyBloom graph={graph} />}
      </div>
    </div>
  );
}
