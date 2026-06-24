import { StatusBadge } from '../core/StatusBadge';
import { Meter } from './Meter';

/**
 * CandidateCard — a scannable summary of one CandidateIdea (generation lists, "in flight", inspector
 * header). Composes the StatusBadge + Meter primitives; the selected winner gets the gold border +
 * glow. TS-strict port of docs/doppl-design-system/components/cards/CandidateCard.jsx
 * (adherence-clean — var() tokens, the prototype's raw-px padding → --space tokens).
 */
export interface CandidateSummary {
  id: string;
  subtype: 'cross_domain_transfer' | 'zeitgeist_synthesis';
  title?: string;
  summary?: string;
  status: string;
  agenomeId?: string;
}

export interface CandidateCardProps {
  candidate: CandidateSummary;
  /** 0..1 */
  fitnessTotal?: number;
  /** 0..1 */
  novelty?: number;
  criticSummary?: { passed: number; total: number };
  checkSummary?: { passed: number; failed: number; skipped: number };
  generation?: number;
  agenomeId?: string;
  /** Force the selected (gold) treatment; defaults to status === "selected". */
  selected?: boolean;
  onInspect?: (id: string) => void;
}

export function CandidateCard({
  candidate,
  fitnessTotal,
  novelty,
  criticSummary,
  checkSummary,
  generation,
  agenomeId,
  selected,
  onInspect,
}: CandidateCardProps) {
  const isSel = selected ?? candidate.status === 'selected';
  return (
    <div
      data-testid="candidate-card"
      onClick={onInspect ? () => onInspect(candidate.id) : undefined}
      style={{
        fontFamily: 'var(--font-ui)',
        width: '100%',
        boxSizing: 'border-box',
        background: 'var(--bg-surface)',
        border: `thin solid ${isSel ? 'var(--status-selected)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-3) var(--space-4)',
        cursor: onInspect ? 'pointer' : 'default',
        boxShadow: isSel ? 'var(--glow-winner)' : 'var(--elev-1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <StatusBadge domain="candidate" status={candidate.status} size="sm" />
        <StatusBadge domain="subtype" status={candidate.subtype} />
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--fg-faint)',
          }}
        >
          {candidate.id}
        </span>
      </div>

      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-default)', lineHeight: 1.3 }}>
        {candidate.title || candidate.summary || 'Untitled candidate'}
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
        Gen {generation ?? '—'} · {agenomeId || candidate.agenomeId || '—'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {fitnessTotal != null && (
          <Meter kind="fitness" value={fitnessTotal} label="fitness" height={8} />
        )}
        {novelty != null && <Meter kind="novelty" value={novelty} label="novelty" height={8} />}
      </div>

      {(criticSummary || checkSummary) && (
        <div
          style={{
            display: 'flex',
            gap: 14,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--fg-muted)',
          }}
        >
          {criticSummary && (
            <span>
              ⊘ {criticSummary.passed}/{criticSummary.total}
            </span>
          )}
          {checkSummary && (
            <span>
              <span style={{ color: 'var(--check-passed)' }}>✓{checkSummary.passed}</span>{' '}
              <span style={{ color: 'var(--check-failed)' }}>✕{checkSummary.failed}</span>{' '}
              <span style={{ color: 'var(--check-skipped)' }}>–{checkSummary.skipped}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
