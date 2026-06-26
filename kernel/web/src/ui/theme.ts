/**
 * Theme tokens (P7.3). Mirrors the CSS variables in theme.css for
 * component code that needs to compute colors / sizes directly (chart
 * series, lineage edges, etc.). Single source of truth — change here
 * AND in theme.css.
 */

/**
 * Palette references the CSS custom properties (defined in theme.css)
 * rather than baking hex, so charts / status shapes / lineage all
 * follow the active theme — including the light-mode toggle. The hex
 * source of truth lives in theme.css :root and :root[data-theme=light].
 */
export const PALETTE = {
  cyan: "var(--doppl-cyan)", // info
  green: "var(--doppl-green)", // ok
  orange: "var(--doppl-orange)", // warn
  yellow: "var(--doppl-yellow)", // pending
  blue: "var(--doppl-blue)", // accent blue
  vermilion: "var(--doppl-vermilion)", // error
  pink: "var(--doppl-pink)", // skip
  neutral: "var(--doppl-neutral)", // slate
} as const;

export const STATUS_COLORS = {
  ok: PALETTE.green,
  warn: PALETTE.orange,
  error: PALETTE.vermilion,
  skip: PALETTE.pink,
  info: PALETTE.cyan,
  pending: PALETTE.yellow,
  neutral: PALETTE.neutral,
} as const;

export const FONT_SCALE = {
  xs: 14,
  sm: 16,
  base: 18,
  lg: 22,
  xl: 28,
  "2xl": 36,
  "3xl": 48,
} as const;

export const SPACING = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
} as const;
