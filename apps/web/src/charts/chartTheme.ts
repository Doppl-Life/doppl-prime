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

export const BEST_FITNESS_SERIES: SeriesStyle = {
  colorToken: 'var(--status-scored)',
  dash: '0',
  marker: 'circle',
  label: 'Fitness (best)',
};
export const MEAN_FITNESS_SERIES: SeriesStyle = {
  colorToken: 'var(--status-checked)',
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
