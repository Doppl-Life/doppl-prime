import React from "react";

/**
 * ActivityTicker — the live heartbeat. A streaming, reverse-chron feed of the
 * kernel's RunEvents (SSE) so the room FEELS the organism working in real time:
 * agenomes spawning, energy draining, critics reviewing, the held-out judge
 * scoring, fusions, culls. This is the real-time window into the runtime.
 * Fed by the sequence-keyed SSE reducer; ordered by `sequence` only.
 */

const EVENT = {
  "run.configured":     { glyph: "●", color: "--accent" },
  "run.started":        { glyph: "●", color: "--accent" },
  "run.completed":      { glyph: "✔", color: "--success" },
  "run.failed":         { glyph: "△", color: "--danger" },
  "run.stopped":        { glyph: "■", color: "--warning" },
  "generation.started": { glyph: "▸", color: "--accent" },
  "generation.completed": { glyph: "▪", color: "--fg-muted" },
  "agenome.spawned":    { glyph: "◌", color: "--status-active" },
  "agenome.fused":      { glyph: "⚇", color: "--status-reproduced" },
  "agenome.mutated":    { glyph: "∿", color: "--status-mutated" },
  "agenome.reproduced": { glyph: "⚇", color: "--status-reproduced" },
  "candidate.created":  { glyph: "·", color: "--status-created" },
  "critic.reviewed":    { glyph: "⊘", color: "--status-checked" },
  "check.completed":    { glyph: "✓", color: "--check-passed" },
  "novelty.scored":     { glyph: "◈", color: "--novelty-fill" },
  "fitness.scored":     { glyph: "✦", color: "--status-selected" },
  "lineage.culled":     { glyph: "✕", color: "--status-culled" },
  "energy.spent":       { glyph: "⚡", color: "--energy-full" },
  "provider_call_failed": { glyph: "△", color: "--danger" },
  "energy_exhausted":   { glyph: "▽", color: "--warning" },
  "novelty_scoring_degraded": { glyph: "⚠", color: "--warning" },
};

function ago(occurredAt) {
  if (!occurredAt) return "";
  const t = typeof occurredAt === "number" ? occurredAt : Date.parse(occurredAt);
  if (isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
}

export function ActivityTicker({ events = [], mode = "live", maxRows = 12, title = "Activity" }) {
  const rows = events.slice(-maxRows).reverse();
  return (
    <div style={{
      fontFamily: "var(--font-mono)", background: "var(--bg-surface)",
      border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)",
      display: "flex", flexDirection: "column", overflow: "hidden", height: "100%",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        borderBottom: "1px solid var(--border-subtle)", fontSize: 10,
        letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--fg-faint)",
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: mode === "replay" ? "var(--warning)" : "var(--accent)",
          boxShadow: mode === "replay" ? "none" : "var(--glow-active)",
          animation: mode === "replay" ? "none" : "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite",
        }} />
        <span>{title}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-ui)" }}>{mode === "replay" ? "replaying" : "live"}</span>
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
        {rows.length === 0 && (
          <div style={{ padding: "16px 12px", fontSize: 12, color: "var(--fg-faint)", fontFamily: "var(--font-ui)" }}>
            waiting for events…
          </div>
        )}
        {rows.map((e, i) => {
          const spec = EVENT[e.type] || { glyph: "•", color: "--fg-muted" };
          return (
            <div key={(e.sequence ?? i) + ":" + i} style={{
              display: "grid", gridTemplateColumns: "20px 52px 1fr auto",
              alignItems: "baseline", gap: 8, padding: "4px 12px", fontSize: 12,
              animation: i === 0 ? "doppl-spawn var(--motion-fast) var(--ease-out)" : undefined,
            }}>
              <span aria-hidden="true" style={{ color: `var(${spec.color})`, textAlign: "center" }}>{spec.glyph}</span>
              <span style={{ color: "var(--fg-faint)" }}>#{e.sequence ?? "—"}</span>
              <span style={{ color: "var(--fg-default)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--fg-muted)" }}>{e.actor ? e.actor + " " : ""}</span>
                {e.phrase || e.label || e.type}
              </span>
              <span style={{ color: "var(--fg-faint)" }}>{ago(e.occurredAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
