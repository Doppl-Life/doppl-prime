import React from "react";

/**
 * ModeBanner — the unmistakable, projector-legible LIVE vs REPLAY signal.
 * Accessibility-critical: a reviewer must NEVER confuse a recording for a live
 * run. LIVE = cyan, breathing dot. REPLAY = amber, hatched, full-width, static.
 * COMPLETE/STOPPED/FAILED = steady terminal states (LIVE-family colored when it
 * just happened live). Renders at the top z-layer so it can never be occluded.
 */

export function ModeBanner({ mode = "live", generationLabel, recordedAt, fullWidth }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 9,
    fontFamily: "var(--font-ui)", fontSize: 14, fontWeight: 600, lineHeight: 1,
    padding: "8px 14px", borderRadius: "var(--radius-full)",
    letterSpacing: "0.02em",
  };

  if (mode === "replay") {
    return (
      <div
        role="status"
        style={{
          ...base, borderRadius: "var(--radius-sm)",
          width: fullWidth ? "100%" : undefined, justifyContent: fullWidth ? "center" : undefined,
          color: "var(--warning)", border: "1px solid var(--warning)",
          background: "repeating-linear-gradient(45deg, rgba(244,182,80,0.16) 0 8px, rgba(244,182,80,0.05) 8px 16px)",
        }}
      >
        <span aria-hidden="true">⏮</span>
        <span>REPLAY</span>
        <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
          · recorded run · no live calls{recordedAt ? ` · ${recordedAt}` : ""}
        </span>
      </div>
    );
  }

  if (mode === "complete" || mode === "stopped" || mode === "failed") {
    const c = mode === "failed" ? "var(--danger)" : mode === "stopped" ? "var(--warning)" : "var(--success)";
    const glyph = mode === "failed" ? "△" : mode === "stopped" ? "■" : "✔";
    return (
      <div role="status" style={{ ...base, color: c, border: `1px solid ${c}`, background: "color-mix(in oklab, " + c + " 12%, transparent)" }}>
        <span aria-hidden="true">{glyph}</span>
        <span>{mode.toUpperCase()}</span>
        {generationLabel && <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· {generationLabel}</span>}
      </div>
    );
  }

  // LIVE
  return (
    <div role="status" style={{ ...base, color: "var(--accent)", border: "1px solid var(--accent)", background: "var(--accent-soft)" }}>
      <span aria-hidden="true" style={{
        width: 9, height: 9, borderRadius: "50%", background: "var(--accent)",
        boxShadow: "var(--glow-active)",
        animation: "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite",
      }} />
      <span>● LIVE</span>
      {generationLabel && <span style={{ color: "var(--fg-default)", fontWeight: 500 }}>— {generationLabel}</span>}
    </div>
  );
}
