/**
 * Theme tokens (P7.3). Mirrors the CSS variables in theme.css for
 * component code that needs to compute colors / sizes directly (chart
 * series, lineage edges, etc.). Single source of truth — change here
 * AND in theme.css.
 */

export const PALETTE = {
  cyan: "#4f6f86", // dusty slate-blue
  green: "#7c8a36", // drab moss / olive-lime
  orange: "#bd8b3a", // ochre
  yellow: "#ccbd5e", // khaki tan
  blue: "#3a526b", // deep slate-blue
  vermilion: "#a8472d", // brick / rust
  pink: "#976470", // dusty mauve
  neutral: "#7c7c64", // stone
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
