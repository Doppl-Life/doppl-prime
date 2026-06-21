import React from "react";

/**
 * StatusBadge — the atomic status token used on every node, card, and inspector.
 * Encodes status via SHAPE + ICON + LABEL + COLOR (never color alone) — the
 * colorblind-safe, projector-legible backbone of the whole UI. Survives grayscale.
 */

const MAP = {
  agenome: {
    seeded:          { glyph: "◌", color: "--status-seeded",     label: "seeded" },
    active:          { glyph: "◐", color: "--status-active",     label: "active", pulse: true },
    spent:           { glyph: "○", color: "--status-spent",      label: "spent" },
    eligible_parent: { glyph: "★", color: "--status-eligible",   label: "eligible" },
    reproduced:      { glyph: "⚇", color: "--status-reproduced", label: "reproduced" },
    mutated:         { glyph: "∿", color: "--status-mutated",    label: "mutated" },
    failed:          { glyph: "△", color: "--status-failed",     label: "failed" },
    culled:          { glyph: "✕", color: "--status-culled",     label: "culled" },
  },
  candidate: {
    created:      { glyph: "·", color: "--status-created",  label: "created" },
    under_review: { glyph: "◐", color: "--status-review",   label: "under review", pulse: true },
    checked:      { glyph: "◑", color: "--status-checked",  label: "checked" },
    scored:       { glyph: "◉", color: "--status-scored",   label: "scored" },
    selected:     { glyph: "♔", color: "--status-selected", label: "selected", glow: "--glow-winner" },
    rejected:     { glyph: "✕", color: "--status-rejected", label: "rejected" },
    culled:       { glyph: "✕", color: "--status-culled",   label: "culled" },
    invalid:      { glyph: "△", color: "--status-invalid",  label: "invalid" },
  },
  check: {
    passed:  { glyph: "✓", color: "--check-passed",  label: "passed" },
    failed:  { glyph: "✕", color: "--check-failed",  label: "failed" },
    skipped: { glyph: "–", color: "--check-skipped", label: "skipped" },
  },
  run: {
    configured: { glyph: "○", color: "--fg-muted",      label: "configured" },
    running:    { glyph: "●", color: "--status-active",  label: "live", pulse: true },
    completing: { glyph: "◐", color: "--status-active",  label: "completing", pulse: true },
    completed:  { glyph: "✔", color: "--success",        label: "complete" },
    stopping:   { glyph: "◐", color: "--warning",        label: "stopping" },
    stopped:    { glyph: "■", color: "--warning",        label: "stopped" },
    failed:     { glyph: "△", color: "--danger",         label: "failed" },
    cancelled:  { glyph: "✕", color: "--fg-faint",       label: "cancelled" },
  },
  subtype: {
    cross_domain_transfer: { glyph: "XFER", color: "--subtype-transfer",  label: "cross_domain_transfer", pill: true },
    zeitgeist_synthesis:   { glyph: "ZEIT", color: "--subtype-zeitgeist", label: "zeitgeist_synthesis",   pill: true },
  },
};

const SIZES = {
  sm: { glyph: 13, label: 11, gap: 6 },
  md: { glyph: 16, label: 12, gap: 8 },
  lg: { glyph: 22, label: 14, gap: 10 },
};

export function StatusBadge({
  domain = "agenome",
  status,
  size = "md",
  showLabel = true,
  pulse,
  reason,
}) {
  const spec = (MAP[domain] && MAP[domain][status]) || {
    glyph: "?", color: "--fg-muted", label: String(status || "unknown"),
  };
  const s = SIZES[size] || SIZES.md;
  const color = `var(${spec.color})`;
  const isPulsing = pulse !== undefined ? pulse : !!spec.pulse;

  // Subtype renders as a pill (text + shape + color, never color alone).
  if (spec.pill) {
    return (
      <span
        title={spec.label}
        style={{
          display: "inline-flex", alignItems: "center",
          fontFamily: "var(--font-mono)", fontSize: s.label, fontWeight: 600,
          letterSpacing: "0.06em", color,
          padding: "3px 8px", borderRadius: "var(--radius-sm)",
          border: `1px solid ${color}`,
          background: "color-mix(in oklab, " + color + " 16%, transparent)",
        }}
      >
        {spec.glyph}
      </span>
    );
  }

  const glyphStyle = {
    fontSize: s.glyph, lineHeight: 1, color,
    textShadow: spec.glow ? `var(${spec.glow})` : undefined,
    animation: isPulsing ? "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite" : undefined,
  };

  return (
    <span
      title={reason ? `${spec.label}: ${reason}` : spec.label}
      style={{
        display: "inline-flex", alignItems: "center", gap: s.gap,
        fontFamily: "var(--font-ui)", color,
      }}
    >
      <span aria-hidden="true" style={glyphStyle}>{spec.glyph}</span>
      {showLabel && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: s.label, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          {spec.label}{reason ? <span style={{ color: "var(--fg-faint)", fontWeight: 400 }}> · {reason}</span> : null}
        </span>
      )}
    </span>
  );
}
