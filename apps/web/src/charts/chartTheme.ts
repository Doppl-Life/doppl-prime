import { PALETTE } from "../ui/theme.js";

/**
 * Chart series theme (P7.8). Each series gets a distinct
 * (color, strokeDasharray, dot shape) tuple so colorblind viewers
 * and projector audiences can distinguish lines without relying on
 * color alone.
 */

export interface SeriesTheme {
  stroke: string;
  strokeDasharray: string;
  dotShape: "circle" | "square" | "triangle" | "diamond" | "star";
}

export const SERIES_THEMES: readonly SeriesTheme[] = [
  { stroke: PALETTE.cyan, strokeDasharray: "0", dotShape: "circle" },
  { stroke: PALETTE.orange, strokeDasharray: "8 4", dotShape: "square" },
  { stroke: PALETTE.green, strokeDasharray: "2 2", dotShape: "triangle" },
  { stroke: PALETTE.vermilion, strokeDasharray: "8 2 2 2", dotShape: "diamond" },
  { stroke: PALETTE.pink, strokeDasharray: "4 4", dotShape: "star" },
];

const FALLBACK_THEME: SeriesTheme = {
  stroke: PALETTE.cyan,
  strokeDasharray: "0",
  dotShape: "circle",
};

export function pickSeriesTheme(index: number): SeriesTheme {
  return SERIES_THEMES[index % SERIES_THEMES.length] ?? FALLBACK_THEME;
}
