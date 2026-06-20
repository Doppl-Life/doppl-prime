import type { JSX } from "react";
import type { EvidenceRefT } from "../data/contracts.js";

/**
 * EvidenceRef resolver (P7.10). Renders a Postgres-tier link only —
 * eventId / uri pointers reference authoritative events. External
 * URLs are NOT followed; if `uri` is present, the link is rendered
 * as a plain label (the dashboard never navigates externally from
 * an evidence ref).
 */

export interface EvidenceRefLinkProps {
  reference: EvidenceRefT;
}

export function EvidenceRefLink({ reference }: EvidenceRefLinkProps): JSX.Element {
  const { kind, eventId, uri, label } = reference;
  if (eventId) {
    // Hash-fragment routing inside the SPA — never an external URL.
    return (
      <a
        href={`#/events/${encodeURIComponent(eventId)}`}
        title={`${kind}: ${eventId}`}
        style={{ color: "var(--doppl-cyan)" }}
      >
        {label ?? `${kind} · ${eventId.slice(0, 8)}…`}
      </a>
    );
  }
  if (uri) {
    return (
      <span
        title={`uri: ${uri}`}
        style={{ color: "var(--doppl-text-secondary)" }}
        data-evidence-kind={kind}
      >
        {label ?? kind}
      </span>
    );
  }
  return (
    <span style={{ color: "var(--doppl-text-muted)" }} data-evidence-kind={kind}>
      {label ?? `${kind} (no reference)`}
    </span>
  );
}
