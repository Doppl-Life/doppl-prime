import React from "react";

/**
 * RunEnergyGauge — the run-wide energy budget as a draining charge: the visible
 * "this is finite by construction" signal (RunCaps.energyBudget). Segmented
 * charge meter + mono spent/budget; thresholds nominal/warning/critical/exhausted.
 */

const SEGMENTS = 12;

export function RunEnergyGauge({ spent = 0, budget = 1, mode = "live", showLabel = true, unit = "doppl_energy" }) {
  const frac = budget > 0 ? Math.max(0, Math.min(1, 1 - spent / budget)) : 0; // remaining
  const remainingPct = frac;
  const color =
    remainingPct <= 0 ? "var(--energy-empty)" :
    remainingPct < 0.1 ? "var(--energy-low)" :
    remainingPct < 0.3 ? "var(--energy-mid)" :
    "var(--energy-full)";
  const litCount = Math.round(remainingPct * SEGMENTS);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)" }}>
      <span aria-hidden="true" style={{ color, fontSize: 15 }}>⚡</span>
      <span style={{ display: "inline-flex", gap: 2 }}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const lit = i < litCount;
          return (
            <span key={i} style={{
              width: 6, height: 16, borderRadius: 2,
              background: lit ? color : "var(--energy-empty)",
              boxShadow: lit && remainingPct >= 0.3 && mode === "live" ? "var(--glow-energy)" : "none",
            }} />
          );
        })}
      </span>
      {showLabel && (
        <span style={{ fontSize: 13, color: "var(--fg-default)" }}>
          {spent.toLocaleString()} / {budget.toLocaleString()} <span style={{ color: "var(--fg-faint)" }}>{unit}</span>
        </span>
      )}
    </div>
  );
}
