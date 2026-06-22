import React from "react";

/**
 * Meter — the length-is-truth primitive behind EnergyMeter, NoveltyMeter, and
 * FitnessBreakdown bars. Fitness/novelty/energy are NEVER communicated by hue
 * alone: the fill LENGTH is the truth, color only grades it, and a mono number
 * sits alongside. Energy carries a charge glow that shrinks as it drains.
 */

function fillColor(kind, value) {
  if (kind === "novelty") return "var(--novelty-fill)";
  if (kind === "energy") {
    if (value <= 0.15) return "var(--energy-low)";
    if (value <= 0.5) return "var(--energy-mid)";
    return "var(--energy-full)";
  }
  // fitness (default)
  if (value < 0.4) return "var(--fitness-low)";
  if (value < 0.7) return "var(--fitness-mid)";
  return "var(--fitness-high)";
}

export function Meter({
  value = 0,
  kind = "fitness",
  label,
  valueLabel,
  showValue = true,
  degraded = false,
  height = 10,
  style,
}) {
  const v = Math.max(0, Math.min(1, value));
  const pct = (v * 100).toFixed(0) + "%";
  const color = fillColor(kind, v);
  const shownValue = valueLabel != null ? valueLabel : v.toFixed(2);

  const fill = degraded
    ? {
        backgroundImage:
          "repeating-linear-gradient(45deg, " + color + " 0 5px, transparent 5px 10px)",
        opacity: 0.8,
      }
    : { background: color, boxShadow: kind === "energy" ? "var(--glow-energy)" : undefined };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "var(--font-ui)", ...style }}>
      {label && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)", minWidth: 96 }}>
          {label}
        </span>
      )}
      <div style={{ flex: 1, height, borderRadius: "var(--radius-full)", background: "var(--meter-track)", overflow: "hidden" }}>
        <div style={{
          width: pct, height: "100%", borderRadius: "var(--radius-full)",
          transition: "width var(--motion-energy-drain-ms) var(--ease-out)", ...fill,
        }} />
      </div>
      {showValue && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg-default)", minWidth: 44, textAlign: "right" }}>
          {shownValue}{degraded ? <span style={{ color: "var(--warning)" }}> ~est</span> : null}
        </span>
      )}
    </div>
  );
}
