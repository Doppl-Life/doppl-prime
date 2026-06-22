import React from "react";

/**
 * HealthIndicator — the operator's cockpit gauge and the continue-vs-switch-to-
 * replay signal during the 10-minute window (GET /runs/:id/health). Surfaces the
 * one runtime read Langfuse can't give: current generation, candidates in flight,
 * last-event age, caps consumed. Stalled = the cue to drop a rung on the ladder.
 */

const STATE = {
  healthy:  { color: "--health-healthy",  glyph: "♥", label: "healthy" },
  slowing:  { color: "--health-degraded", glyph: "♥", label: "slowing" },
  slow:     { color: "--health-degraded", glyph: "♥", label: "slow" },
  degraded: { color: "--health-degraded", glyph: "⚠", label: "degraded" },
  stalled:  { color: "--health-stalled",  glyph: "△", label: "stalled" },
};

function CapBar({ label, value }) {
  const pct = Math.round((value || 0) * 100);
  const near = pct >= 90;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "58px 1fr 34px", gap: 8, alignItems: "center" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>{label}</span>
      <span style={{ height: 6, borderRadius: "var(--radius-full)", background: "var(--meter-track)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: pct + "%", background: near ? "var(--warning)" : "var(--accent)" }} />
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: near ? "var(--warning)" : "var(--fg-muted)", textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

export function HealthIndicator({ health = {}, status = "healthy", showCaps = true, mode = "live" }) {
  const s = STATE[status] || STATE.healthy;
  const caps = health.capsConsumed || {};
  const ageMs = health.lastEventAgeMs;
  const age = ageMs == null ? "—" : ageMs < 1000 ? "<1s" : Math.round(ageMs / 1000) + "s";
  const pulse = status === "stalled" || (mode === "live" && status === "healthy");
  return (
    <div style={{ fontFamily: "var(--font-ui)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}>
        <span aria-hidden="true" style={{
          color: `var(${s.color})`, fontSize: 14,
          animation: pulse && status === "stalled" ? "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite" : undefined,
        }}>{s.glyph}</span>
        <span style={{ color: `var(${s.color})`, fontWeight: 600 }}>{s.label}</span>
        <span style={{ color: "var(--fg-muted)" }}>
          gen {health.currentGeneration ?? "—"} · {health.candidatesInFlight ?? 0} in-flight · last evt {age}
        </span>
      </div>
      {showCaps && Object.keys(caps).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {Object.entries(caps).map(([k, v]) => (
            <CapBar key={k} label={k} value={v} />
          ))}
        </div>
      )}
    </div>
  );
}
