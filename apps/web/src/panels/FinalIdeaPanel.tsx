import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { StatusBadge } from '../components/core/StatusBadge';
import type {
  CandidateIdea,
  LineageGraphProjection,
  RunEventEnvelope,
  RunEventType,
} from '../data/contracts';
import type { RunClient } from '../data/runClient';
import type { RunMode } from '../state/reducer';
import { isRunTerminal } from '../components/run/runControl';
import { EvidenceRefLink } from './evidenceRef';
import { evidenceRungLabel, gatherProof, selectWinner } from './finalIdeaData';

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
  /** Run mode (PD.7) — labels the transfer-evidence rung live vs replay. `undefined` = no label. */
  mode?: RunMode | undefined;
  /** The run's latest run-level event type (PD.7) — when no winner + terminal, reflect that state
   *  instead of the in-progress affordance. `undefined` = run still in progress (today's behavior). */
  runStatus?: RunEventType | undefined;
}

/** The terminal word shown in the zero-survivors copy, keyed by the run-terminal event type. */
const TERMINAL_WORD: Readonly<Record<string, string>> = {
  'run.completed': 'completed',
  'run.failed': 'failed',
  'run.stopped': 'stopped',
};

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
const rungLabel: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  marginRight: 'var(--space-2)',
};

/** The kernel-emitted human-readable terminal summary string carried on `run.{completed,failed,stopped}`.
 *  Read-only display; never re-judges (rule #6). Returns null if absent or non-string. */
function readTerminalSummary(
  events: readonly RunEventEnvelope[],
  runStatus: RunEventType,
): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const env = events[i]!;
    if (env.type !== runStatus) continue;
    const summary = (env.payload as { terminalSummary?: unknown }).terminalSummary;
    return typeof summary === 'string' && summary.length > 0 ? summary : null;
  }
  return null;
}

/** Counts of high-traffic events so a no-winner terminal screen still tells the operator what happened. */
function tallyRun(events: readonly RunEventEnvelope[]): {
  generations: number;
  candidates: number;
  critiques: number;
  scored: number;
} {
  let generations = 0;
  let candidates = 0;
  let critiques = 0;
  let scored = 0;
  for (const env of events) {
    if (env.type === 'generation.completed') generations++;
    else if (env.type === 'candidate.created') candidates++;
    else if (env.type === 'critic.reviewed') critiques++;
    else if (env.type === 'fitness.scored') scored++;
  }
  return { generations, candidates, critiques, scored };
}

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
  mode,
  runStatus,
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

  // No selected winner — graceful, NEVER a fabricated winner (rule #6). A TERMINAL run with no winner
  // reflects its terminal state (PD.7 zero-survivors); a non-terminal run keeps the in-progress affordance.
  // Even without a selected winner we surface the kernel-emitted `terminalSummary` from the run-terminal
  // event + lightweight event tallies so the payoff screen isn't barren for pre-PD.11 / stale-fixture runs.
  if (winner === null) {
    if (runStatus !== undefined && isRunTerminal(runStatus)) {
      const word = TERMINAL_WORD[runStatus] ?? 'ended';
      const summary = readTerminalSummary(events, runStatus);
      const tallies = tallyRun(events);
      return (
        <div
          role="img"
          aria-label={`Final idea — none; run ${word}`}
          style={{ ...section, padding: 'var(--space-4)' }}
        >
          <div style={empty}>No surviving idea — run {word}.</div>
          {summary !== null && (
            <ProofSection label="kernel terminal summary">{summary}</ProofSection>
          )}
          <ProofSection label="run summary">
            {tallies.generations} generation(s) · {tallies.candidates} candidate(s) ·{' '}
            {tallies.critiques} critic review(s) · {tallies.scored} fitness score(s)
          </ProofSection>
        </div>
      );
    }
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

      {/* PD.7 — the transfer-evidence rung: the live/replay provenance label (mode-derived, colorblind-safe
          shape+text) + the winner's evidenceRefs via the shared EvidenceRefLink (in-tier, no href). */}
      <ProofSection label="transfer evidence">
        {mode !== undefined && (
          <span data-evidence-rung={mode} style={rungLabel}>
            <span aria-hidden="true">{mode === 'replay' ? '⏮' : '▶'}</span>
            <span>{evidenceRungLabel(mode)}</span>
          </span>
        )}
        {candidate.evidenceRefs.length === 0 ? (
          <span style={muted}>—</span>
        ) : (
          candidate.evidenceRefs.map((ref, i) => <EvidenceRefLink key={i} evidenceRef={ref} />)
        )}
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
