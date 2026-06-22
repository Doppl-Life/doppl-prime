import type { CSSProperties } from 'react';
import type { CandidateIdea } from '../data/contracts';

/**
 * EvidenceRefLink — renders an `EvidenceRef` as an IN-TIER pointer (ARCHITECTURE.md §9/§4 / safety rule
 * #9). The pointer fields (`eventId`/`uri`/`langfuseObservationId`) reference authoritative
 * events/projections WITHIN the Postgres tier; this component renders them as TEXT + exposes them on
 * `data-*` attributes for the shell to resolve at integration — it NEVER constructs an external `<a
 * href>` (a `uri` is an in-tier pointer string, not a clickable external URL). Optional fields degrade
 * gracefully (a label-only `prior_art` ref renders just kind + label). Adherence: var() tokens only.
 *
 * The type derives from the already-seamed `CandidateIdea` (no separate EvidenceRef import needed —
 * getCandidate Zod-validates the whole candidate, so only the TYPE is required to render).
 */
export type EvidenceRefValue = CandidateIdea['evidenceRefs'][number];

const chip: CSSProperties = {
  display: 'inline-flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const pointer: CSSProperties = { color: 'var(--fg-faint)' };

export function EvidenceRefLink({ evidenceRef }: { evidenceRef: EvidenceRefValue }) {
  const { kind, eventId, uri, label, langfuseObservationId } = evidenceRef;
  // data-* attrs carry the in-tier link targets for the shell to resolve — NOT an href.
  const dataAttrs = {
    ...(eventId !== undefined ? { 'data-event-id': eventId } : {}),
    ...(uri !== undefined ? { 'data-uri': uri } : {}),
    ...(langfuseObservationId !== undefined
      ? { 'data-observation-id': langfuseObservationId }
      : {}),
  };
  return (
    <span style={chip} {...dataAttrs}>
      <span aria-hidden="true">◆</span>
      <span>{kind}</span>
      {label !== undefined && <span>{label}</span>}
      {eventId !== undefined && <code style={pointer}>event:{eventId}</code>}
      {uri !== undefined && <code style={pointer}>{uri}</code>}
      {langfuseObservationId !== undefined && (
        <code style={pointer}>trace:{langfuseObservationId}</code>
      )}
    </span>
  );
}
