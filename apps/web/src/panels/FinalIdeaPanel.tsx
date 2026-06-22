import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { StatusBadge } from '../components/core/StatusBadge';
import type { CandidateIdea, LineageGraphProjection, RunEventEnvelope } from '../data/contracts';
import type { RunClient } from '../data/runClient';
import { gatherProof, selectWinner } from './finalIdeaData';

/**
 * FinalIdeaPanel — the §12 capstone. Identifies the kernel/judge-selected winner (the lineage node with
 * `type:'candidate'` + `status:'selected'`, via `selectWinner`) and renders it as a DEFENSIBLE proof:
 * the winner idea (getCandidate) + in-tier proof sections linking its lineage node, critic reviews
 * (P7.11), subtype-checks (P7.12), fitness score-components (§8), energy (P7.9), and traces — so the
 * final idea is defensible from critic + check evidence. Compact link-not-embed sections (the shell
 * composes the full panels via the dataRef/candidateId targets).
 *
 * EMIT-ONLY (rule #6): the panel DISPLAYS the selected winner — it never re-ranks/derives its own winner.
 * Traces + evidence resolve IN-TIER (no external href, rule #9). No winner yet → graceful affordance.
 * Read-only (rule #2). Mounted by the P7.14 shell.
 */
export interface FinalIdeaPanelProps {
  runId: string;
  lineage: LineageGraphProjection;
  events: readonly RunEventEnvelope[];
  runClient: Pick<RunClient, 'getCandidate'>;
  /** Wired by the shell to focus the winner's lineage node (link target = the winner dataRef). */
  onSelectLineageNode?: (dataRef: string) => void;
}

const section: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-3)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
};
const empty: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  padding: 'var(--space-4)',
};
const heading: CSSProperties = { fontSize: 'var(--text-h2)', margin: 0 };
const proofLabel: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const proofValue: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
};
const muted: CSSProperties = { color: 'var(--fg-muted)' };

function ProofSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <span style={proofLabel}>{label}</span>
      <div style={proofValue}>{children}</div>
    </div>
  );
}

export function FinalIdeaPanel({
  runId,
  lineage,
  events,
  runClient,
  onSelectLineageNode,
}: FinalIdeaPanelProps) {
  const winner = useMemo(() => selectWinner(lineage), [lineage]);
  const [candidate, setCandidate] = useState<CandidateIdea | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (winner === null) {
      setCandidate(null);
      return;
    }
    let active = true;
    setLoading(true);
    setErrored(false);
    runClient
      .getCandidate(runId, winner.dataRef)
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
  }, [winner, runId, runClient]);

  // No selected winner yet (run in progress) — graceful, never a fabricated winner.
  if (winner === null) {
    return (
      <div role="img" aria-label="Final idea — none yet" style={empty}>
        No final idea yet — the surviving idea appears once a candidate is selected.
      </div>
    );
  }
  if (loading) {
    return (
      <div role="status" style={muted}>
        Loading final idea…
      </div>
    );
  }
  if (errored || candidate === null) {
    return (
      <div role="alert" style={{ color: 'var(--danger)' }}>
        Failed to load the final idea — retry.
      </div>
    );
  }

  const proof = gatherProof(winner, candidate, events);

  return (
    <section aria-label="Final surviving idea" style={section}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <h2 style={heading}>{candidate.title}</h2>
        <StatusBadge domain="candidate" status="selected" />
      </header>
      <p style={{ margin: 0 }}>{candidate.summary}</p>
      <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
        {candidate.claims.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>

      <ProofSection label="lineage">
        <button
          type="button"
          data-lineage-ref={winner.dataRef}
          onClick={() => onSelectLineageNode?.(winner.dataRef)}
          style={{
            font: 'inherit',
            color: 'var(--accent)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          {winner.dataRef}
        </button>
      </ProofSection>

      <ProofSection label="fitness">
        {proof.fitnessTotal !== null ? (
          <>
            <span>total {proof.fitnessTotal}</span>
            {proof.fitnessComponents !== null && (
              <span>
                {' · '}
                {Object.entries(proof.fitnessComponents)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(' · ')}
              </span>
            )}
          </>
        ) : (
          <span style={muted}>—</span>
        )}
      </ProofSection>

      <ProofSection label="energy">
        {proof.energy !== null ? (
          <span>{proof.energy.total} doppl_energy</span>
        ) : (
          <span style={muted}>—</span>
        )}
      </ProofSection>

      <ProofSection label="critic reviews">
        {proof.reviews.length === 0 ? (
          <span style={muted}>—</span>
        ) : (
          proof.reviews.map((r) => (
            <span key={r.id}>
              {r.mandate} ({r.confidence}){' '}
            </span>
          ))
        )}
      </ProofSection>

      <ProofSection label="subtype checks">
        {proof.checks.length === 0 ? (
          <span style={muted}>—</span>
        ) : (
          proof.checks.map((c) => (
            <span key={c.id}>
              {c.checkType}: {c.status}{' '}
            </span>
          ))
        )}
      </ProofSection>

      <ProofSection label="traces">
        {proof.traces.length === 0 ? (
          <span style={muted}>—</span>
        ) : (
          proof.traces.map((t) => (
            // In-tier trace refs — text + data-* targets the shell resolves; NEVER an external href.
            <span
              key={t.eventId}
              data-trace-id={t.traceId}
              data-observation-id={t.observationId}
              style={{ color: 'var(--fg-faint)' }}
            >
              {t.traceId !== undefined ? `trace:${t.traceId} ` : ''}
              {t.observationId !== undefined ? `obs:${t.observationId} ` : ''}
            </span>
          ))
        )}
      </ProofSection>
    </section>
  );
}
