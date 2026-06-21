import type { JSX } from "react";
import { useCandidateChecks, useRunState } from "../state/runStore.js";
import { StatusIndicator } from "../ui/StatusIndicator.js";
import { EvidenceRefLink } from "./evidenceRef.js";

/**
 * Subtype-check evidence panel (P7.12). CheckResult rows for the
 * selected candidate. Each row shows checkType, status (via the shared
 * primitive — passed/failed/skipped distinguishable without color),
 * score / skipReason / error, and EvidenceRef links (Postgres tier
 * only).
 */

export function CheckEvidence(): JSX.Element {
  const state = useRunState();
  const candidateId = state.selection.candidateId;
  const checks = useCandidateChecks(candidateId);

  if (!candidateId) {
    return (
      <section aria-label="Check evidence">
        <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>Check evidence</h2>
        <p style={{ color: "var(--doppl-text-secondary)" }}>
          Select a candidate to see its check results.
        </p>
      </section>
    );
  }
  return (
    <section aria-label="Check evidence">
      <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>Check evidence · {candidateId}</h2>
      {checks.length === 0 ? (
        <p style={{ color: "var(--doppl-text-secondary)" }}>No check results yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ padding: "6px 12px 6px 0" }}>Check</th>
              <th style={{ padding: "6px 12px" }}>Status</th>
              <th style={{ padding: "6px 12px" }}>Detail</th>
              <th style={{ padding: "6px 0 6px 12px" }}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => (
              <tr key={check.id}>
                <td style={{ padding: "6px 12px 6px 0", verticalAlign: "top" }}>
                  {check.checkType}
                  {check.checkType === "final_judge" && (
                    <span
                      style={{
                        marginLeft: 6,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "var(--doppl-bg-input)",
                        fontSize: 12,
                        color: "var(--doppl-status-warn)",
                      }}
                    >
                      JUDGE
                    </span>
                  )}
                </td>
                <td style={{ padding: "6px 12px", verticalAlign: "top" }}>
                  <StatusIndicator domain="check" status={check.status} size="sm" />
                </td>
                <td style={{ padding: "6px 12px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                  {check.status === "skipped"
                    ? (check.skipReason ?? "(no reason)")
                    : check.status === "failed"
                      ? (check.error ?? "(no error)")
                      : check.score !== undefined
                        ? `score ${check.score.toFixed(2)}`
                        : "—"}
                </td>
                <td style={{ padding: "6px 0 6px 12px", verticalAlign: "top" }}>
                  {check.evidenceRefs.length === 0
                    ? "—"
                    : check.evidenceRefs.map((ref, i) => (
                        <span key={`${ref.kind}-${i}`} style={{ marginRight: 8 }}>
                          <EvidenceRefLink reference={ref} />
                        </span>
                      ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
