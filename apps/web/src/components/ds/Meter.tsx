import type { CSSProperties } from 'react';

/**
 * Meter — the length-is-truth primitive behind energy / novelty / fitness bars. The fill LENGTH is
 * the truth; color only grades it; a mono number sits alongside. Quantities are NEVER communicated
 * by hue alone (DS rule #1/#5). TS-strict port of docs/doppl-design-system/components/core/Meter.jsx
 * — adherence-clean (var() tokens; the prototype's raw-px hatch stops → --space-* tokens).
 */
export interface MeterProps {
  /** Normalized 0..1. */
  value: number;
  /** Grades the fill color + glow. */
  kind?: 'fitness' | 'novelty' | 'energy';
  /** Mono label to the left (e.g. "novelty", an agenome id). */
  label?: string;
  /** Override the numeric readout (e.g. "61%", "0.84"). Defaults to value.toFixed(2). */
  valueLabel?: string;
  showValue?: boolean;
  /** novelty_scoring_degraded → striped fill + "~est" flag. */
  degraded?: boolean;
  height?: number;
  style?: CSSProperties;
}

function fillColor(kind: NonNullable<MeterProps['kind']>, value: number): string {
  if (kind === 'novelty') return 'var(--novelty-fill)';
  if (kind === 'energy') {
    if (value <= 0.15) return 'var(--energy-low)';
    if (value <= 0.5) return 'var(--energy-mid)';
    return 'var(--energy-full)';
  }
  // fitness (default)
  if (value < 0.4) return 'var(--fitness-low)';
  if (value < 0.7) return 'var(--fitness-mid)';
  return 'var(--fitness-high)';
}

export function Meter({
  value,
  kind = 'fitness',
  label,
  valueLabel,
  showValue = true,
  degraded = false,
  height = 10,
  style,
}: MeterProps) {
  const v = Math.max(0, Math.min(1, value));
  const pct = `${(v * 100).toFixed(0)}%`;
  const color = fillColor(kind, v);
  const shownValue = valueLabel != null ? valueLabel : v.toFixed(2);

  const fill: CSSProperties = degraded
    ? {
        backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 var(--space-1), transparent var(--space-1) var(--space-2))`,
        opacity: 0.8,
      }
    : { background: color, boxShadow: kind === 'energy' ? 'var(--glow-energy)' : undefined };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'var(--font-ui)',
        ...style,
      }}
    >
      {label && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--fg-muted)',
            minWidth: 96,
          }}
        >
          {label}
        </span>
      )}
      <div
        style={{
          flex: 1,
          height,
          borderRadius: 'var(--radius-full)',
          background: 'var(--meter-track)',
          overflow: 'hidden',
        }}
      >
        <div
          data-testid="meter-fill"
          style={{
            width: pct,
            height: '100%',
            borderRadius: 'var(--radius-full)',
            transition: 'width var(--motion-energy-drain-ms) var(--ease-out)',
            ...fill,
          }}
        />
      </div>
      {showValue && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--fg-default)',
            minWidth: 44,
            textAlign: 'right',
          }}
        >
          {shownValue}
          {degraded ? <span style={{ color: 'var(--warning)' }}> ~est</span> : null}
        </span>
      )}
    </div>
  );
}
