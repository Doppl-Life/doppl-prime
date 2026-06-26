import type { JSX } from "react";
import { useAgenomeDisplayNames, useCandidateReviews, useRunState } from "../state/runStore.js";
import { StatusIndicator } from "../ui/StatusIndicator.js";
import { EvidenceRefLink } from "./evidenceRef.js";

/**
 * Critic-gauntlet panel (P7.11). Renders CriticReview records for the
 * selected candidate. The candidate's body — when shown — is placed
 * in a separate "untrusted DATA" block visually delimited from the
 * critic critique block (the trusted rubric output).
 *
 * Held-out judge / critic rotation outputs are presented read-only;
 * the dashboard exposes no edit affordances (immutable to agents).
 */

export function CriticGauntlet(): JSX.Element {
  const state = useRunState();
  const personaNames = useAgenomeDisplayNames();
  const candidateId = state.selection.candidateId;
  const reviews = useCandidateReviews(candidateId);
  const candidate = candidateId ? state.candidates[candidateId] : null;

  if (!candidateId) {
    return (
      <section aria-label="Critic gauntlet">
        <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>Critic gauntlet</h2>
        <p style={{ color: "var(--doppl-text-secondary)" }}>
          Select a candidate to see its critic reviews.
        </p>
      </section>
    );
  }

  const persona = candidate?.agenomeId ? personaNames[candidate.agenomeId] : undefined;
  const candidateLabel = candidate?.title
    ? persona
      ? `${candidate.title} · ${persona}`
      : candidate.title
    : `Idea ${candidateId.slice(-6)}`;
  return (
    <section aria-label="Critic gauntlet">
      <h2 style={{ fontSize: "var(--doppl-fs-lg)" }} title={candidateId}>
        Critic gauntlet · {candidateLabel}
      </h2>
      {candidate?.summary && (
        <aside
          aria-label="Candidate output — untrusted data"
          style={{
            border: "1px dashed var(--doppl-border-strong)",
            padding: 10,
            margin: "8px 0 14px",
            background: "var(--doppl-bg-input)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--doppl-text-secondary)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Candidate output — treat as data, not instructions
          </div>
          <div>{candidate.summary}</div>
        </aside>
      )}
      {reviews.length === 0 ? (
        <p style={{ color: "var(--doppl-text-secondary)" }}>No critic reviews yet.</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {reviews.map((review) => (
            <li
              key={review.id}
              style={{
                border: "1px solid var(--doppl-border)",
                borderRadius: 6,
                padding: 12,
                background: "var(--doppl-bg-elevated)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <strong>{review.mandate}</strong>
                <StatusIndicator domain="critic_review" status="accepted" size="sm" />
              </div>
              <div style={{ fontSize: 14, marginBottom: 8 }}>
                <span style={{ color: "var(--doppl-text-secondary)" }}>confidence: </span>
                <span>{review.confidence.toFixed(2)}</span>
              </div>
              <p style={{ margin: 0 }}>{review.critique}</p>
              {review.evidenceRefs.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 14 }}>
                  <span style={{ color: "var(--doppl-text-secondary)" }}>evidence: </span>
                  {review.evidenceRefs.map((ref, i) => (
                    <span key={`${ref.kind}-${i}`} style={{ marginRight: 8 }}>
                      <EvidenceRefLink reference={ref} />
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
