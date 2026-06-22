import React from "react";
import { Meter } from "../core/Meter.jsx";

/**
 * CriticGauntletPanel — the adversarial gauntlet a candidate faces: one row per
 * CriticMandate (the critic council emits evidence only, never picks winners),
 * plus the held-out JUDGE row — the frozen, immutable-to-agents anchor that
 * decides "gen N+1 beats gen N". Live: rows arrive as critic.reviewed events land.
 */

const MANDATE = {
  factual_grounding: "grounding",
  novelty_prior_art: "novelty / prior-art",
  feasibility: "feasibility",
  falsification: "falsification",
  subtype_specific: "subtype-specific",
};

function ConfidencePips({ value }) {
  const n = Math.round((value || 0) * 5);
  return (
    <span title={`confidence ${(value ?? 0).toFixed(2)}`} style={{ display: "inline-flex", gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: "50%",
          background: i < n ? "var(--fg-muted)" : "var(--meter-track)",
        }} />
      ))}
    </span>
  );
}

function GauntletRow({ review }) {
  const reviewing = review.score == null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", alignItems: "center", gap: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>
          <span aria-hidden="true" style={{ color: "var(--status-checked)" }}>⊘</span>
          {MANDATE[review.mandate] || review.mandate}
        </span>
        {reviewing ? (
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--status-active)",
            animation: "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite" }}>reviewing…</span>
        ) : (
          <Meter kind="fitness" value={review.score} showValue={true} height={7} />
        )}
        <ConfidencePips value={review.confidence} />
      </div>
      {review.critique && (
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--fg-faint)", paddingLeft: 150 + 12 }}>
          "{review.critique}"
        </div>
      )}
    </div>
  );
}

export function CriticGauntletPanel({ reviews = [], judge, title = "Critic gauntlet", mode = "live" }) {
  const positive = reviews.filter((r) => r.score != null && r.score >= 0.6).length;
  const scored = reviews.filter((r) => r.score != null).length;
  return (
    <div style={{
      fontFamily: "var(--font-ui)", background: "var(--bg-surface)",
      border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "12px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fg-faint)" }}>
          {title}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>
          {positive}/{scored || reviews.length} positive
        </span>
      </div>

      {reviews.map((r, i) => <GauntletRow key={r.mandate || i} review={r} />)}

      {judge && (
        <div style={{
          marginTop: 10, padding: "10px 12px", borderRadius: "var(--radius-md)",
          background: "color-mix(in oklab, var(--status-selected) 8%, transparent)",
          border: "1px solid var(--status-selected)",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", alignItems: "center", gap: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--status-selected)", fontWeight: 600 }}>
              <span aria-hidden="true">⚖</span> held-out judge
            </span>
            <Meter kind="fitness" value={judge.acceptance} height={8} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-selected)" }}>★ anchor</span>
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--fg-faint)", marginTop: 4, paddingLeft: 162 }}>
            frozen · immutable to agents · the floor the organism cannot lift
          </div>
        </div>
      )}
    </div>
  );
}
