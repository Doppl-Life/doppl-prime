import type { CSSProperties } from 'react';

/**
 * Sparkline — a tiny, axis-free trend line for an in-row series (the runs table draws the best-fitness
 * climb across generations here). Auto-scales Y to the series' own min/max so the SHAPE of the trend is
 * the signal; a marker dots the latest point. Pure SVG, theme tokens only (no raw hex/px — the run/
 * adherence test), and `vector-effect: non-scaling-stroke` keeps the line crisp as the svg flexes to
 * the cell width. Decorative-but-labeled: `role="img"` + an aria-label carry the meaning to AT.
 */
export interface SparklineProps {
  values: readonly number[];
  /** Stroke color token (defaults to the accent). */
  color?: string;
  /** Intrinsic viewBox units; the svg renders at width:100% and this height. */
  width?: number;
  height?: number;
  ariaLabel?: string;
}

const PAD = 2;

export function Sparkline({
  values,
  color = 'var(--accent)',
  width = 100,
  height = 20,
  ariaLabel,
}: SparklineProps) {
  const svgStyle: CSSProperties = { width: '100%', height, display: 'block', overflow: 'visible' };
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerH = height - PAD * 2;
  const xAt = (i: number): number =>
    values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
  // Flat series (span 0) sits on the mid-line rather than pinning to top or bottom.
  const yAt = (v: number): number =>
    span === 0 ? height / 2 : PAD + (1 - (v - min) / span) * innerH;

  const last = values[values.length - 1] as number;
  const lastX = xAt(values.length - 1);
  const lastY = yAt(last);

  if (values.length === 1) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={svgStyle}
        role="img"
        aria-label={ariaLabel}
      >
        <circle cx={lastX} cy={lastY} r={2} fill={color} />
      </svg>
    );
  }

  const points = values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={svgStyle}
      role="img"
      aria-label={ariaLabel}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={2} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
