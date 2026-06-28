import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { RunEventEnvelope } from '../data/contracts';
import { deriveFitnessSeries } from './chartData';
import { BEST_FITNESS_SERIES, MARKER_GLYPH, MEAN_FITNESS_SERIES } from './chartTheme';
import type { MarkerShape, SeriesStyle } from './chartTheme';

/**
 * FitnessOverTime — plots the peak `FitnessScore.total` per generation (REQ-E-001), so generation-
 * over-generation improvement is visible. Derives its series from the `fitness.scored` events (pure
 * `deriveFitnessSeries`), reading the persisted `total` verbatim — never recomputing. Encodes the
 * series via marker glyph + text label + stroke pattern in addition to color (rule #4 / §12), renders
 * partial-data-safe (zero → an empty-state affordance; one generation → a single marker), and re-derives
 * as the event list grows. `showComponents` overlays the best candidate's component signals (distinct
 * labels — a non-color channel). Hand-rolled SVG (no charting dep); the geometry numerics are layout.
 */
export interface FitnessOverTimeProps {
  events: readonly RunEventEnvelope[];
  /** Overlay the best candidate's FitnessScore.components per generation. */
  showComponents?: boolean;
}

const W = 320;
const H = 210;
const PAD_X = 34; // left/right gutter — also holds the y-axis scale labels
const PAD_TOP = 16;
const PAD_BOTTOM = 26; // room for the per-generation x-axis labels
// Y gridline fractions of the axis max — give the plot a readable scale (0 / mid / max) instead of a
// bare floating line. Fitness ∈ [0,1] so the axis tops out at 1.0.
const GRID_FRACTIONS = [0, 0.5, 1];

const wrap: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-ui)',
};
const empty: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  padding: 'var(--space-4)',
};
const legend: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const COMPONENT_MARKERS: MarkerShape[] = ['square', 'triangle', 'diamond'];

function LegendItem({ style }: { style: SeriesStyle }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
      <span aria-hidden="true" style={{ color: style.colorToken }}>
        {MARKER_GLYPH[style.marker]}
      </span>
      <span>{style.label}</span>
    </li>
  );
}

export function FitnessOverTime({ events, showComponents = false }: FitnessOverTimeProps) {
  const series = useMemo(() => deriveFitnessSeries(events), [events]);

  if (series.length === 0) {
    return (
      <div role="img" aria-label="Fitness over time — no data yet" style={empty}>
        No fitness data yet — points appear as generations are scored.
      </div>
    );
  }

  const n = series.length;
  const maxY = Math.max(1, ...series.map((p) => p.best));
  const xAt = (i: number) => (n === 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (n - 1));
  const yAt = (v: number) => PAD_TOP + (1 - v / maxY) * (H - PAD_TOP - PAD_BOTTOM);
  const baselineY = yAt(0);
  const bestPoints = series.map((p, i) => `${xAt(i)},${yAt(p.best)}`).join(' ');
  // Filled area under the best line (the headline series) — a soft cyan wash that anchors the eye and
  // makes the gen-over-gen trend read at a glance, without competing with the mean line above it.
  const bestArea = `M ${xAt(0)},${baselineY} ${bestPoints
    .split(' ')
    .map((pt) => `L ${pt}`)
    .join(' ')} L ${xAt(n - 1)},${baselineY} Z`;
  // The per-generation MEAN fitness, alongside the peak (FV.6 — closes the P7 mean-defined-but-unrendered
  // reachability finding). mean ≤ best, so maxY (best-bounded) already contains it; a distinct dash +
  // square marker + label is a non-color channel (rule #4 / §12).
  const meanPoints = series.map((p, i) => `${xAt(i)},${yAt(p.mean)}`).join(' ');

  // Component overlay series (distinct labels = a non-color channel) — keyed off the best candidates.
  const componentKeys = showComponents
    ? [...new Set(series.flatMap((p) => Object.keys(p.components ?? {})))]
    : [];
  const componentStyles: SeriesStyle[] = componentKeys.map((key, i) => ({
    colorToken: 'var(--fg-muted)',
    dash: '4 3',
    marker: COMPONENT_MARKERS[i % COMPONENT_MARKERS.length]!,
    label: key,
  }));

  return (
    <section aria-label="Fitness over time" style={wrap}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fitness over generations" width="100%">
        {/* Y gridlines + scale labels — give the plot a readable 0 / mid / max reference. */}
        {GRID_FRACTIONS.map((f) => {
          const gy = yAt(f * maxY);
          return (
            <g key={`grid-${f}`} aria-hidden="true">
              <line
                x1={PAD_X}
                y1={gy}
                x2={W - PAD_X}
                y2={gy}
                stroke="var(--border-subtle)"
                strokeWidth={1}
              />
              <text x={PAD_X - 6} y={gy + 3} fill="var(--fg-faint)" fontSize={9} textAnchor="end">
                {(f * maxY).toFixed(1)}
              </text>
            </g>
          );
        })}
        {/* Per-generation x-axis labels (G0, G1, …) so the horizontal axis isn't unlabeled. */}
        {series.map((p, i) => (
          <text
            key={`xlabel-${p.generationId}`}
            x={xAt(i)}
            y={H - PAD_BOTTOM + 16}
            fill="var(--fg-faint)"
            fontSize={9}
            textAnchor="middle"
          >
            {`G${p.index}`}
          </text>
        ))}
        {/* Soft cyan wash under the best line. */}
        <path d={bestArea} fill={BEST_FITNESS_SERIES.colorToken} fillOpacity={0.1} stroke="none" />
        <polyline
          points={bestPoints}
          fill="none"
          stroke={BEST_FITNESS_SERIES.colorToken}
          strokeWidth={2}
          strokeDasharray={BEST_FITNESS_SERIES.dash}
        />
        {series.map((p, i) => (
          <text
            key={p.generationId}
            x={xAt(i)}
            y={yAt(p.best)}
            fill={BEST_FITNESS_SERIES.colorToken}
            fontSize={12}
            textAnchor="middle"
          >
            {MARKER_GLYPH[BEST_FITNESS_SERIES.marker]}
          </text>
        ))}
        <polyline
          points={meanPoints}
          fill="none"
          stroke={MEAN_FITNESS_SERIES.colorToken}
          strokeWidth={2}
          strokeDasharray={MEAN_FITNESS_SERIES.dash}
        />
        {series.map((p, i) => (
          <text
            key={`mean-${p.generationId}`}
            x={xAt(i)}
            y={yAt(p.mean)}
            fill={MEAN_FITNESS_SERIES.colorToken}
            fontSize={12}
            textAnchor="middle"
          >
            {MARKER_GLYPH[MEAN_FITNESS_SERIES.marker]}
          </text>
        ))}
        {componentStyles.map((style, ci) => {
          const pts = series
            .map((p, i) => `${xAt(i)},${yAt(p.components?.[componentKeys[ci]!] ?? 0)}`)
            .join(' ');
          return (
            <polyline
              key={componentKeys[ci]}
              points={pts}
              fill="none"
              stroke={style.colorToken}
              strokeWidth={1}
              strokeDasharray={style.dash}
            />
          );
        })}
      </svg>
      <ul style={legend}>
        <LegendItem style={BEST_FITNESS_SERIES} />
        <LegendItem style={MEAN_FITNESS_SERIES} />
        {componentStyles.map((style) => (
          <LegendItem key={style.label} style={style} />
        ))}
      </ul>
    </section>
  );
}
