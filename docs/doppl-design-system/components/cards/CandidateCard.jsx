import React from "react";
import { StatusBadge } from "../core/StatusBadge.jsx";
import { Meter } from "../core/Meter.jsx";

/**
 * CandidateCard — a scannable summary of one CandidateIdea. Used in generation
 * lists, "candidates in flight", and as the header of CandidateInspector.
 * Click → inspector; hover highlights its node in the LineageGraph.
 */
export function CandidateCard({
  candidate = {},
  fitnessTotal,
  novelty,
  criticSummary,
  checkSummary,
  generation,
  agenomeId,
  selected,
  onInspect,
}) {
  const isSel = selected ?? candidate.status === "selected";
  return (
    <div
      onClick={onInspect ? () => onInspect(candidate.id) : undefined}
      style={{
        fontFamily: "var(--font-ui)", width: "100%", boxSizing: "border-box",
        background: "var(--bg-surface)",
        border: `1px solid ${isSel ? "var(--status-selected)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-lg)", padding: "12px 14px",
        cursor: onInspect ? "pointer" : "default",
        boxShadow: isSel ? "var(--glow-winner)" : "var(--elev-1)",
        display: "flex", flexDirection: "column", gap: 9,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StatusBadge domain="candidate" status={candidate.status} size="sm" />
        <StatusBadge domain="subtype" status={candidate.subtype} />
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-faint)" }}>
          {candidate.id}
        </span>
      </div>

      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-default)", lineHeight: 1.3 }}>
        {candidate.title || candidate.summary || "Untitled candidate"}
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>
        Gen {generation ?? "—"} · {agenomeId || candidate.agenomeId || "—"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {fitnessTotal != null && <Meter kind="fitness" value={fitnessTotal} label="fitness" height={8} />}
        {novelty != null && <Meter kind="novelty" value={novelty} label="novelty" height={8} />}
      </div>

      {(criticSummary || checkSummary) && (
        <div style={{ display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>
          {criticSummary && <span>⊘ {criticSummary.passed}/{criticSummary.total}</span>}
          {checkSummary && (
            <span>
              <span style={{ color: "var(--check-passed)" }}>✓{checkSummary.passed}</span>{" "}
              <span style={{ color: "var(--check-failed)" }}>✕{checkSummary.failed}</span>{" "}
              <span style={{ color: "var(--check-skipped)" }}>–{checkSummary.skipped}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
