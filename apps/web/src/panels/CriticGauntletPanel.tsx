import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { CriticMandate } from '../data/contracts';
import type { RunEventEnvelope } from '../data/contracts';
import { deriveReviewsByCandidate } from './criticData';
import type { CriticReviewValue } from './criticData';
import { EvidenceRefLink } from './evidenceRef';

/**
 * CriticGauntletPanel — the §12 critic-gauntlet. Renders the adversarial council's reviews for one
 * candidate across the 5 `CriticMandate`s (factual_grounding / novelty_prior_art / feasibility /
 * falsification / subtype_specific), derived from `critic.reviewed` events (pure `deriveReviewsByCandidate`,
 * §6). Per review: mandate + scores + critique + confidence (numeric + meter — not color alone, rule #4)
 * + evidenceRefs via the P7.10 in-tier `EvidenceRefLink` (§9/§4). A mandate with no review degrades to a
 * "not reviewed" affordance (never a fabricated verdict).
 *
 * KEY SAFETY RULE #6 (emit-only, DISPLAYED): the panel shows every review unranked + its critique and
 * confidence — it NEVER derives a winner / selection / verdict from the critiques (critics are evidence,
 * not deciders). Read-only (rule #2). Reachable from the P7.7 lineage critic node's `dataRef`.
 */
export interface CriticGauntletPanelProps {
  events: readonly RunEventEnvelope[];
  candidateId: string;
  onSelectEvidence?: (eventId: string) => void;
}

const wrap: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-3)',
  fontFamily: 'var(--font-ui)',
};
const empty: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  padding: 'var(--space-4)',
};
const mandateHead: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  fontWeight: 600,
  color: 'var(--fg-default)',
};
const notReviewed: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-faint)',
};
const reviewCard: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-1)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
};
const meta: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const track: CSSProperties = {
  height: 'var(--space-1)',
  background: 'var(--meter-track)',
  borderRadius: 'var(--radius-full)',
  overflow: 'hidden',
};

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const clamped = Math.max(0, Math.min(1, confidence));
  return (
    <div style={meta}>
      <span>confidence {confidence}</span>
      <div style={track} role="progressbar" aria-valuenow={Math.round(clamped * 100)}>
        <div
          style={{
            height: '100%',
            width: `${Math.round(clamped * 100)}%`,
            background: 'var(--status-scored)',
          }}
        />
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: CriticReviewValue }) {
  return (
    <div style={reviewCard}>
      <ConfidenceMeter confidence={review.confidence} />
      <div style={meta}>
        {Object.entries(review.scores).map(([k, v]) => (
          <span key={k}>
            {k} {v}{' '}
          </span>
        ))}
      </div>
      <p style={{ margin: 0 }}>{review.critique}</p>
      {review.evidenceRefs.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 'var(--space-1)',
          }}
        >
          {review.evidenceRefs.map((ref, i) => (
            <li key={i}>
              <EvidenceRefLink evidenceRef={ref} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CriticGauntletPanel({ events, candidateId }: CriticGauntletPanelProps) {
  const reviews = useMemo(
    () => deriveReviewsByCandidate(events).get(candidateId) ?? [],
    [events, candidateId],
  );

  if (reviews.length === 0) {
    return (
      <div role="img" aria-label="Critic gauntlet — no reviews yet" style={empty}>
        No critic reviews yet — the council reviews as candidates enter the gauntlet.
      </div>
    );
  }

  return (
    <section aria-label="Critic gauntlet" style={wrap}>
      {CriticMandate.options.map((mandate) => {
        const forMandate = reviews.filter((r) => r.mandate === mandate);
        return (
          <div key={mandate} style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <span style={mandateHead}>{mandate}</span>
            {forMandate.length === 0 ? (
              <span style={notReviewed}>— not reviewed</span>
            ) : (
              forMandate.map((review) => <ReviewCard key={review.id} review={review} />)
            )}
          </div>
        );
      })}
    </section>
  );
}
