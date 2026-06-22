import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { RunEventEnvelope } from '../data/contracts';
import { deriveGenerationComparison } from './chartData';
import { BEST_FITNESS_SERIES, BEST_NOVELTY_SERIES, MARKER_GLYPH } from './chartTheme';
import type { SeriesStyle } from './chartTheme';

/**
 * GenerationComparison — contrasts generations on best fitness + best novelty (from the `fitness.scored`
 * / `novelty.scored` events via the pure `deriveGenerationComparison`, persisted values read verbatim).
 * Grouped bars per generation; each series carries a marker glyph + text label in addition to color
 * (rule #4 / §12). Partial-data-safe (zero → empty-state affordance; one generation → renders) and re-
 * derives as events grow. Hand-rolled SVG (no charting dep); geometry numerics are layout, not styling.
 */
export interface GenerationComparisonProps {
  events: readonly RunEventEnvelope[];
}

const W = 360;
const H = 180;
const PAD_X = 28;
const PAD_Y = 24;
const BAR = 10;

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

export function GenerationComparison({ events }: GenerationComparisonProps) {
  const points = useMemo(() => deriveGenerationComparison(events), [events]);

  if (points.length === 0) {
    return (
      <div role="img" aria-label="Generation comparison — no data yet" style={empty}>
        No generation data yet — bars appear as generations are scored.
      </div>
    );
  }

  const n = points.length;
  const plotH = H - 2 * PAD_Y;
  const groupW = (W - 2 * PAD_X) / n;
  const yBar = (v: number) => plotH - Math.max(0, Math.min(1, v)) * plotH; // fitness/novelty ∈ [0,1]

  return (
    <section aria-label="Generation comparison" style={wrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Per-generation fitness vs novelty"
        width="100%"
      >
        {points.map((p, i) => {
          const gx = PAD_X + i * groupW + groupW / 2;
          return (
            <g key={p.generationId}>
              <rect
                x={gx - BAR - 1}
                y={PAD_Y + yBar(p.bestFitness)}
                width={BAR}
                height={plotH - yBar(p.bestFitness)}
                fill={BEST_FITNESS_SERIES.colorToken}
              />
              <rect
                x={gx + 1}
                y={PAD_Y + yBar(p.bestNovelty)}
                width={BAR}
                height={plotH - yBar(p.bestNovelty)}
                fill={BEST_NOVELTY_SERIES.colorToken}
              />
              <text x={gx} y={H - 6} fill="var(--fg-faint)" fontSize={10} textAnchor="middle">
                {`G${p.index}`}
              </text>
            </g>
          );
        })}
      </svg>
      <ul style={legend}>
        <LegendItem style={BEST_FITNESS_SERIES} />
        <LegendItem style={BEST_NOVELTY_SERIES} />
      </ul>
    </section>
  );
}
