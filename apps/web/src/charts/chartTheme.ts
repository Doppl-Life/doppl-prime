/**
 * chartTheme — the token-based series styling for the §12 charts. Each series encodes FOUR channels so
 * it is colorblind-safe + projector-legible (rule #4 — never color alone): a `colorToken` (`var(--…)`,
 * the only color channel), a `dash` stroke pattern, a `marker` shape (rendered as a glyph), and a text
 * `label`. Colors are `var()` tokens ONLY (no raw hex); the `dash` strings are stroke geometry. The
 * pixel-level chart visuals are covered by the P7.15 Playwright smoke.
 */

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond';

/** The marker glyph per shape — a grayscale-surviving, projector-legible shape channel. */
export const MARKER_GLYPH: Record<MarkerShape, string> = {
  circle: '●',
  square: '■',
  triangle: '▲',
  diamond: '◆',
};

export interface SeriesStyle {
  /** The ONLY color channel — a `var(--token)` reference (never a raw hex). */
  readonly colorToken: string;
  /** strokeDasharray pattern (geometry) — the pattern channel. */
  readonly dash: string;
  /** The marker shape (rendered via MARKER_GLYPH) — the shape channel. */
  readonly marker: MarkerShape;
  /** The text label — the label channel (legend + a11y). */
  readonly label: string;
}

// Best vs mean were both blue (--status-scored / --status-checked) — near-indistinguishable. They now use
// a warm/cool pair (cyan peak vs amber average) so they separate on color too, not just dash + marker.
// Cyan↔amber is maximally distinct under the common colorblindness types (the color is still the 4th
// channel after dash + marker glyph + label, per rule #4). Cyan stays clear of the violet novelty series.
export const BEST_FITNESS_SERIES: SeriesStyle = {
  colorToken: 'var(--accent)',
  dash: '0',
  marker: 'circle',
  label: 'Fitness (best)',
};
export const MEAN_FITNESS_SERIES: SeriesStyle = {
  colorToken: 'var(--warning)',
  dash: '6 4',
  marker: 'square',
  label: 'Fitness (mean)',
};
export const BEST_NOVELTY_SERIES: SeriesStyle = {
  colorToken: 'var(--subtype-zeitgeist)',
  dash: '2 4',
  marker: 'triangle',
  label: 'Novelty (best)',
};
export const MEAN_NOVELTY_SERIES: SeriesStyle = {
  colorToken: 'var(--subtype-transfer)',
  dash: '1 3',
  marker: 'diamond',
  label: 'Novelty (mean)',
};
