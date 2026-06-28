import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { StatusBadge } from '../components/core/StatusBadge';
import type { CandidateIdea } from '../data/contracts';
import type { RunClient } from '../data/runClient';
import { EvidenceRefLink } from './evidenceRef';

/**
 * CandidateInspector — the §12 candidate inspector. Loads a candidate via `getCandidate(runId,
 * candidateId)` (Zod-validated through the frozen `CandidateIdea`) and renders the common fields +
 * the subtype-discriminated payload. Dispatch is on the frozen `subtype` discriminant, so TS narrows
 * `subtypePayload` to the matching shape and one subtype can never crash on the other's; an unexpected
 * subtype + missing optional fields degrade gracefully (no throw/blank). Status uses the shared
 * accessible StatusBadge (shape+label+icon, rule #4). EvidenceRefs render as in-tier pointers (§9/§4 —
 * never an external href). Read-only (rule #2); candidate text is DATA displayed, never interpolated.
 * Reachable from the P7.7 lineage candidate node's `dataRef` (candidateId) — the P7.14 shell mounts it.
 */
export interface CandidateInspectorProps {
  runId: string;
  candidateId: string;
  runClient: Pick<RunClient, 'getCandidate'>;
}

type CrossDomainPayload = Extract<
  CandidateIdea,
  { subtype: 'cross_domain_transfer' }
>['subtypePayload'];
type ZeitgeistPayload = Extract<
  CandidateIdea,
  { subtype: 'zeitgeist_synthesis' }
>['subtypePayload'];

const section: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-3)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
};
const heading: CSSProperties = { fontSize: 'var(--text-h2)', margin: 0 };
// Prominent "WINNING IDEA" pill — replaces the small SELECTED badge when this candidate is the
// kernel-marked winner, so the inspector's identity is immediately legible.
const winnerPill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  alignSelf: 'flex-start',
  padding: 'var(--space-1) var(--space-3)',
  // matches the winning-idea banner treatment: outlined gold in dark, filled yellow in light.
  background: 'var(--winner-banner-bg)',
  border: 'thin solid var(--winner-banner-border)',
  borderRadius: 'var(--radius-full)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--winner-banner-accent)',
};
const fieldLabel: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const list: CSSProperties = { margin: 0, paddingLeft: 'var(--space-4)' };
const muted: CSSProperties = { color: 'var(--fg-muted)' };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <span style={fieldLabel}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function StringList({ label, items }: { label: string; items: readonly string[] }) {
  if (items.length === 0) return <Field label={label} value="—" />; // graceful empty
  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <span style={fieldLabel}>{label}</span>
      <ul style={list}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function CrossDomainView({ payload }: { payload: CrossDomainPayload }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <Field label="source domain" value={payload.sourceDomain} />
      <Field label="source technique" value={payload.sourceTechnique} />
      <Field label="target domain" value={payload.targetDomain} />
      <Field label="target problem" value={payload.targetProblem} />
      <Field label="transfer mapping" value={payload.transferMapping} />
      <Field label="expected mechanism" value={payload.expectedMechanism} />
      {payload.executableCheckIdea !== undefined && (
        <Field label="executable check idea" value={payload.executableCheckIdea} />
      )}
    </div>
  );
}

function ZeitgeistView({ payload }: { payload: ZeitgeistPayload }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <Field label="thesis" value={payload.thesis} />
      <Field label="audience" value={payload.audience} />
      <StringList label="current signals" items={payload.currentSignals} />
      <Field label="why now" value={payload.whyNow} />
      <StringList label="falsifiable predictions" items={payload.falsifiablePredictions} />
      <StringList label="comparable prior art" items={payload.comparablePriorArt} />
    </div>
  );
}

function SubtypeView({ candidate }: { candidate: CandidateIdea }) {
  switch (candidate.subtype) {
    case 'cross_domain_transfer':
      return <CrossDomainView payload={candidate.subtypePayload} />;
    case 'zeitgeist_synthesis':
      return <ZeitgeistView payload={candidate.subtypePayload} />;
    default:
      // graceful default — an unexpected subtype never throws (defensive; unreachable for the 2 frozen).
      return <p style={muted}>Unknown subtype.</p>;
  }
}

export function CandidateInspector({ runId, candidateId, runClient }: CandidateInspectorProps) {
  const [candidate, setCandidate] = useState<CandidateIdea | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrored(false);
    runClient
      .getCandidate(runId, candidateId)
      .then((c) => {
        if (active) setCandidate(c);
      })
      .catch(() => {
        if (active) setErrored(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [runId, candidateId, runClient]);

  if (loading) {
    return (
      <div role="status" style={muted}>
        Loading candidate…
      </div>
    );
  }
  if (errored || candidate === null) {
    return (
      <div role="alert" style={{ color: 'var(--danger)' }}>
        Failed to load candidate — retry.
      </div>
    );
  }

  return (
    <section aria-label="Candidate inspector" style={section}>
      {candidate.status === 'selected' && (
        <span style={winnerPill} aria-label="Winning idea">
          <span aria-hidden="true">♔</span>
          Winning idea
        </span>
      )}
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <h2 style={heading}>{candidate.title}</h2>
        {candidate.status !== 'selected' && (
          <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            <StatusBadge domain="candidate" status={candidate.status} />
          </span>
        )}
      </header>
      <span style={fieldLabel}>{candidate.subtype}</span>
      <p style={{ margin: 0 }}>{candidate.summary}</p>

      <StringList label="claims" items={candidate.claims} />
      <SubtypeView candidate={candidate} />

      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <span style={fieldLabel}>evidence</span>
        {candidate.evidenceRefs.length === 0 ? (
          <span style={muted}>—</span>
        ) : (
          <ul
            style={{
              ...list,
              listStyle: 'none',
              paddingLeft: 0,
              display: 'grid',
              gap: 'var(--space-1)',
            }}
          >
            {candidate.evidenceRefs.map((ref, i) => (
              <li key={i}>
                <EvidenceRefLink evidenceRef={ref} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
