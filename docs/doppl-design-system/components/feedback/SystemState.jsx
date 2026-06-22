import React from "react";

/**
 * The shared system-state shells used by every data-bound surface. Consistency
 * here is what makes degraded modes legible on a projector. Degraded states are
 * first-class — the system tells the truth when something is off, never hides it.
 */

const wrap = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  textAlign: "center", gap: 8, padding: "28px 24px", fontFamily: "var(--font-ui)",
  color: "var(--fg-muted)",
};

export function EmptyState({ icon = "◌", title, description, action }) {
  return (
    <div style={wrap}>
      <div aria-hidden="true" style={{ fontSize: 30, color: "var(--fg-faint)" }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-default)" }}>{title}</div>
      {description && <div style={{ fontSize: 14, color: "var(--fg-muted)", maxWidth: 360 }}>{description}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

export function LoadingState({ shape = "inline", label = "Loading…" }) {
  const rows = shape === "graph" ? 3 : shape === "chart" ? 2 : shape === "inspector" ? 5 : 2;
  const shimmer = {
    height: shape === "graph" ? 40 : 14, borderRadius: "var(--radius-sm)",
    backgroundImage: "linear-gradient(90deg, var(--bg-surface) 0%, var(--bg-surface-2) 40%, var(--bg-surface) 80%)",
    backgroundSize: "220% 100%",
    animation: "doppl-shimmer 1.4s linear infinite",
  };
  return (
    <div style={{ ...wrap, alignItems: "stretch", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ ...shimmer, width: i % 2 ? "78%" : "100%" }} />
      ))}
      <div style={{ fontSize: 13, color: "var(--fg-faint)", textAlign: "center", marginTop: 4 }}>{label}</div>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", detail, onRetry, action, severity = "recoverable" }) {
  const c = severity === "fatal" ? "var(--danger)" : "var(--warning)";
  return (
    <div style={{ ...wrap, background: "var(--danger-soft)", borderRadius: "var(--radius-lg)", border: "1px solid " + c }}>
      <div aria-hidden="true" style={{ fontSize: 26, color: c }}>△</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-default)" }}>{title}</div>
      {detail && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>{detail}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        {onRetry && (
          <button onClick={onRetry} style={btn("var(--border-strong)")}>Retry</button>
        )}
        {action}
      </div>
    </div>
  );
}

const DEGRADED = {
  novelty_degraded: { label: "Novelty degraded", note: "Showing estimated novelty; the fitness novelty-component is flagged." },
  langfuse_off:     { label: "Tracing off", note: "Trace links unavailable — local metadata only." },
  provider_failure: { label: "Provider failure", note: "Affected lineages flagged; switch to the fallback ladder if it persists." },
  all_culled:       { label: "No survivors", note: "Generation completed with 0 survivors — strongest culled lineage shown." },
};

export function DegradedState({ kind = "novelty_degraded", detail }) {
  const d = DEGRADED[kind] || DEGRADED.novelty_degraded;
  return (
    <div role="status" style={{
      display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-ui)",
      fontSize: 13, color: "var(--health-degraded)",
      padding: "8px 12px", borderRadius: "var(--radius-sm)",
      border: "1px dashed var(--health-degraded)",
      background: "color-mix(in oklab, var(--warning) 8%, transparent)",
    }}>
      <span aria-hidden="true" style={{ fontSize: 15 }}>⚠</span>
      <span style={{ fontWeight: 600 }}>{d.label}</span>
      <span style={{ color: "var(--fg-muted)" }}>— {detail || d.note}</span>
    </div>
  );
}

function btn(border) {
  return {
    fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 600, color: "var(--fg-default)",
    background: "var(--bg-surface-2)", border: "1px solid " + border,
    borderRadius: "var(--radius-md)", padding: "7px 14px", cursor: "pointer",
  };
}

/** Aggregate (matches the SystemState.d.ts stem). */
export const SystemState = { EmptyState, LoadingState, ErrorState, DegradedState };
