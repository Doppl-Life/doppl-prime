import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { RunEventEnvelope } from '../data/contracts';
import { deriveFitnessSeries } from './chartData';
import { BEST_FITNESS_SERIES, MARKER_GLYPH } from './chartTheme';
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
const H = 160;
const PAD_X = 28;
const PAD_Y = 20;

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
  const yAt = (v: number) => H - PAD_Y - (v / maxY) * (H - 2 * PAD_Y);
  const bestPoints = series.map((p, i) => `${xAt(i)},${yAt(p.best)}`).join(' ');

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
        {componentStyles.map((style) => (
          <LegendItem key={style.label} style={style} />
        ))}
      </ul>
    </section>
  );
}
