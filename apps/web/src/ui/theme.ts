/**
 * Theme tokens (P7.3). Mirrors the CSS variables in theme.css for
 * component code that needs to compute colors / sizes directly (chart
 * series, lineage edges, etc.). Single source of truth — change here
 * AND in theme.css.
 */

export const PALETTE = {
  cyan: "#56b4e9",
  green: "#009e73",
  orange: "#e69f00",
  yellow: "#f0e442",
  blue: "#0072b2",
  vermilion: "#d55e00",
  pink: "#cc79a7",
  neutral: "#999999",
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
