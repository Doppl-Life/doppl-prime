import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { StatusBadge } from '../components/core/StatusBadge';
import type { RunEventEnvelope } from '../data/contracts';
import { deriveChecksByCandidate } from './checkData';
import type { CheckResultValue } from './checkData';
import { EvidenceRefLink } from './evidenceRef';

/**
 * SubtypeCheckPanel — the §12 subtype-check evidence panel. Renders the allowlisted check-runner results
 * for one candidate, derived from `check.completed` events (pure `deriveChecksByCandidate`, §6). Per check:
 * `checkType` + `status` via the shared check-domain StatusBadge (passed/failed/skipped — shape+label+icon,
 * rule #4) + `score?`/`output?`/`error?`; a SKIPPED check shows its `skipReason` distinctly — the allowlist
 * fail-safe working (rule #3: unregistered/execution-requiring → skipped+reason, never executed), never hidden.
 * EvidenceRefs render in-tier via the P7.10 `EvidenceRefLink` (§9/§4).
 *
 * EMIT-ONLY DISPLAY (rule #3/#6): the panel renders the persisted `status` VERBATIM — it never re-derives
 * pass/fail from `output`/`score` (the check-runner + kernel are authoritative). Read-only (rule #2).
 * Reachable from the P7.7 lineage check node's `dataRef`.
 */
export interface SubtypeCheckPanelProps {
  events: readonly RunEventEnvelope[];
  candidateId: string;
}

const wrap: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-ui)',
};
const empty: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  padding: 'var(--space-4)',
};
const checkCard: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-1)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
};
const head: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
};
const meta: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const skip: CSSProperties = { ...meta, color: 'var(--warning)' };
const err: CSSProperties = { ...meta, color: 'var(--danger)' };

function CheckCard({ check }: { check: CheckResultValue }) {
  return (
    <div style={checkCard}>
      <div style={head}>
        <span>{check.checkType}</span>
        <StatusBadge domain="check" status={check.status} size="sm" />
        {check.score !== undefined && <span style={meta}>score {check.score}</span>}
      </div>
      {check.output !== undefined && <p style={{ ...meta, margin: 0 }}>{check.output}</p>}
      {/* skipped = the allowlist fail-safe working — show the reason distinctly (rule #3), never hide it */}
      {check.skipReason !== undefined && (
        <p style={{ ...skip, margin: 0 }}>skipped: {check.skipReason}</p>
      )}
      {check.error !== undefined && <p style={{ ...err, margin: 0 }}>error: {check.error}</p>}
      {check.evidenceRefs.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 'var(--space-1)',
          }}
        >
          {check.evidenceRefs.map((ref, i) => (
            <li key={i}>
              <EvidenceRefLink evidenceRef={ref} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SubtypeCheckPanel({ events, candidateId }: SubtypeCheckPanelProps) {
  const checks = useMemo(
    () => deriveChecksByCandidate(events).get(candidateId) ?? [],
    [events, candidateId],
  );

  if (checks.length === 0) {
    return (
      <div role="img" aria-label="Subtype checks — no checks yet" style={empty}>
        No checks yet — subtype checks appear as candidates are verified.
      </div>
    );
  }

  return (
    <section aria-label="Subtype-check evidence" style={wrap}>
      {checks.map((check) => (
        <CheckCard key={check.id} check={check} />
      ))}
    </section>
  );
}
