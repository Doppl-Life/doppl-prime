import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { resolveStatus } from '../core/status-map';
import type { RunSummary } from '../../data/runClient';
import { Sparkline } from './Sparkline';
import { runFitness } from './runsSummary';

/**
 * RunPeek — the inline drawer revealed when a runs-table row is expanded. A no-fetch detail panel over
 * the data the row already holds (read-only, rule #2): the full problem + final idea (untruncated), the
 * fitness climb as a larger sparkline with the winner's score, and the run's activity breakdown +
 * identity. Tokens only (the run/ adherence test). Purely presentational.
 */
export interface RunPeekProps {
  run: RunSummary;
}

const wrap: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-5)',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--bg-surface-2)',
  borderRadius: 'var(--radius-md)',
  fontFamily: 'var(--font-ui)',
};
const colMain: CSSProperties = { flex: '2 1 22rem', display: 'grid', gap: 'var(--space-3)' };
const colSide: CSSProperties = { flex: '1 1 14rem', display: 'grid', gap: 'var(--space-3)' };
const label: CSSProperties = {
  fontSize: 'var(--text-mono)',
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--fg-faint)',
  marginBottom: 'var(--space-1)',
};
const bodyText: CSSProperties = {
  fontSize: 'var(--text-label)',
  color: 'var(--fg-default)',
  lineHeight: 1.5,
};
const ideaTitle: CSSProperties = { ...bodyText, fontWeight: 600 };
const statGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(5rem, 1fr))',
  gap: 'var(--space-2)',
};
const stat: CSSProperties = {
  background: 'var(--bg-surface)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
};
const statVal: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-default)',
};
const statLabel: CSSProperties = { fontSize: 'var(--text-mono)', color: 'var(--fg-muted)' };
const idRow: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: 'var(--fg-muted)',
  wordBreak: 'break-all',
};
const bloomLink: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--accent)',
  textDecoration: 'none',
  fontWeight: 700,
};

function Stat({ value, name }: { value: number; name: string }) {
  return (
    <div style={stat}>
      <div style={statVal}>{value}</div>
      <div style={statLabel}>{name}</div>
    </div>
  );
}

export function RunPeek({ run }: RunPeekProps) {
  const spec = resolveStatus('run', run.status ?? 'unknown');
  const fitness = run.fitnessByGeneration ?? [];
  const fit = runFitness(run);
  return (
    <div style={wrap}>
      <div style={colMain}>
        <div>
          <div style={label}>Problem</div>
          <div style={bodyText}>{run.problem ?? '—'}</div>
        </div>
        <div>
          <div style={label}>Final idea</div>
          {run.finalIdeaTitle ? (
            <>
              <div style={ideaTitle}>{run.finalIdeaTitle}</div>
              {run.finalIdeaSummary && (
                <div style={{ ...bodyText, color: 'var(--fg-muted)' }}>{run.finalIdeaSummary}</div>
              )}
            </>
          ) : (
            <div style={{ ...bodyText, color: 'var(--fg-faint)', fontStyle: 'italic' }}>
              No winning idea — this run produced no selected candidate.
            </div>
          )}
        </div>
      </div>
      <div style={colSide}>
        {fitness.length > 0 && (
          <div>
            <div style={label}>Fitness climb{fit !== null ? ` · best ${fit.toFixed(2)}` : ''}</div>
            <Sparkline
              values={fitness}
              color={spec.colorToken}
              height={40}
              ariaLabel={`best fitness across ${fitness.length} generation${
                fitness.length === 1 ? '' : 's'
              }`}
            />
          </div>
        )}
        <div>
          <div style={label}>Activity</div>
          <div style={statGrid}>
            <Stat value={run.generations ?? 0} name="gens" />
            <Stat value={run.candidates ?? 0} name="cands" />
            <Stat value={run.reproductions ?? 0} name="repro" />
            <Stat value={run.culls ?? 0} name="culls" />
            <Stat value={run.mutations ?? 0} name="mut" />
          </div>
        </div>
        <div>
          <div style={label}>Run</div>
          <div style={idRow}>{run.runId}</div>
        </div>
        {run.caseStudyId !== undefined && run.caseStudyId !== null && (
          <div>
            <div style={label}>Case study</div>
            <Link to={`/case-studies/${run.caseStudyId}`} style={bloomLink}>
              ✦ View bloom →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
