import type { CSSProperties } from 'react';
import { resolveStatus } from './status-map';
import type { StatusDomain } from './status-map';

/**
 * StatusBadge — the atomic status token used on every node, card, and inspector. Encodes status via
 * SHAPE + ICON + LABEL + COLOR — never color alone (ARCHITECTURE.md §12) — so it survives grayscale
 * and is colorblind-safe + projector-legible. TS-strict port of the design-system prototype
 * (docs/doppl-design-system/components/core/StatusBadge.jsx); the mapping is the frozen-enum-
 * authoritative status-map. The glyph is aria-hidden; the status reaches assistive tech via the
 * text label + the `title` (programmatically determinable). Adherence: colors/spacing via tokens
 * only (no raw hex/px); motion honors prefers-reduced-motion (handled globally in tokens/base.css).
 */
export interface StatusBadgeProps {
  /** Which lifecycle family the status belongs to. */
  domain?: StatusDomain;
  /** Canonical status string for that domain (e.g. "eligible_parent", "under_review", "skipped"). */
  status: string;
  /** sm = dense graph nodes, md = default, lg = projector / RunHeader. */
  size?: 'sm' | 'md' | 'lg';
  /** Hide the text label (icon-only, e.g. dense graph nodes). Label still in the tooltip. */
  showLabel?: boolean;
  /** Force the breathing pulse on/off. Defaults to the status' own liveness (active / under_review). */
  pulse?: boolean;
  /** For check `skipped` / agenome `failed` — the reason rendered after the label. */
  reason?: string;
}

/** Glyph + label sizes per size token (numeric — projector floor 13; React renders these as px). */
const SIZES = {
  sm: { glyph: 13, label: 11, gap: 6 },
  md: { glyph: 16, label: 12, gap: 8 },
  lg: { glyph: 22, label: 14, gap: 10 },
} as const;

export function StatusBadge({
  domain = 'agenome',
  status,
  size = 'md',
  showLabel = true,
  pulse,
  reason,
}: StatusBadgeProps) {
  const spec = resolveStatus(domain, status);
  const s = SIZES[size];
  const color = spec.colorToken;
  const isPulsing = pulse !== undefined ? pulse : Boolean(spec.pulse);

  // Subtype renders as a pill (text + shape + color, never color alone). `thin` border + token
  // padding keep it adherence-clean (no raw px).
  if (spec.pill) {
    return (
      <span
        title={spec.label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: s.label,
          fontWeight: 600,
          letterSpacing: '0.06em',
          color,
          padding: 'var(--space-1) var(--space-2)',
          borderRadius: 'var(--radius-sm)',
          border: `thin solid ${color}`,
          background: `color-mix(in oklab, ${color} 16%, transparent)`,
        }}
      >
        {spec.glyph}
      </span>
    );
  }

  const glyphStyle: CSSProperties = { fontSize: s.glyph, lineHeight: 1, color };
  if (spec.glow) glyphStyle.textShadow = spec.glow;
  if (isPulsing) {
    glyphStyle.animation = 'doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite';
  }

  return (
    <span
      title={reason ? `${spec.label}: ${reason}` : spec.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: s.gap,
        fontFamily: 'var(--font-ui)',
        color,
      }}
    >
      <span aria-hidden="true" style={glyphStyle}>
        {spec.glyph}
      </span>
      {showLabel && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: s.label,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {spec.label}
          {reason ? (
            <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}> · {reason}</span>
          ) : null}
        </span>
      )}
    </span>
  );
}
