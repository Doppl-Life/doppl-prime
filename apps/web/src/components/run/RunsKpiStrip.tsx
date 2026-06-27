import type { CSSProperties } from 'react';
import type { RunSummary } from '../../data/runClient';
import { computeKpis, relativeTime } from './runsSummary';

/**
 * RunsKpiStrip — the headline summary above the runs table: total runs, success rate, average
 * candidates, and how long ago the last run started. Derived live from the same RunSummary list the
 * table renders (read-only, rule #2) — no separate fetch. Each figure is a metric card; the values are
 * the truth, the labels grade them. Tokens only (no raw hex/px — the run/ dir adherence test).
 */
export interface RunsKpiStripProps {
  runs: readonly RunSummary[];
}

const strip: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
  gap: 'var(--space-3)',
};
const card: CSSProperties = {
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3) var(--space-4)',
  display: 'grid',
  gap: 'var(--space-1)',
};
const label: CSSProperties = {
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  fontFamily: 'var(--font-ui)',
};
const value: CSSProperties = {
  fontSize: 'var(--text-h2)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
  lineHeight: 1.1,
};
const liveDot: CSSProperties = {
  display: 'inline-block',
  width: 'var(--space-2)',
  height: 'var(--space-2)',
  borderRadius: 'var(--radius-full)',
  background: 'var(--status-active)',
  marginRight: 'var(--space-2)',
  animation: 'doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite',
};

function Metric({
  label: l,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div style={card} data-testid={testId}>
      <span style={label}>{l}</span>
      <span style={value}>{children}</span>
    </div>
  );
}

export function RunsKpiStrip({ runs }: RunsKpiStripProps) {
  const kpis = computeKpis(runs);
  return (
    <section aria-label="Runs summary" style={strip}>
      <Metric label="Total runs" testId="kpi-total">
        {kpis.total}
      </Metric>
      <Metric label="Success rate" testId="kpi-success">
        <span style={{ color: kpis.successRatePct >= 50 ? 'var(--success)' : 'var(--fg-default)' }}>
          {kpis.successRatePct}%
        </span>
      </Metric>
      <Metric label="Avg candidates" testId="kpi-avg-cands">
        {kpis.avgCandidates}
      </Metric>
      <Metric label={kpis.running > 0 ? 'Active now' : 'Last run'} testId="kpi-last">
        {kpis.running > 0 ? (
          <span style={{ color: 'var(--status-active)' }}>
            <span style={liveDot} aria-hidden="true" />
            {kpis.running} live
          </span>
        ) : (
          relativeTime(kpis.lastRunIso)
        )}
      </Metric>
    </section>
  );
}
