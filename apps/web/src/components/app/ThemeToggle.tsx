import { Button } from '../ds';
import { useTheme } from './useTheme';
import type { Theme } from './useTheme';

/**
 * ThemeToggle — the AppShell's dark / high-contrast / light cycle control (FV.1). Shows the current
 * theme; clicking advances to the next (dark → hc → light → dark). The accessible name announces both
 * the current theme and the next, so it is operable + legible without color. Uses the DS ghost Button.
 */
const LABEL: Record<Theme, string> = { dark: 'Dark', hc: 'High-contrast', light: 'Light' };
const NEXT: Record<Theme, Theme> = { dark: 'hc', hc: 'light', light: 'dark' };

export function ThemeToggle() {
  const { theme, cycle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      glyph="◐"
      onClick={cycle}
      aria-label={`Theme: ${LABEL[theme]} — switch to ${LABEL[NEXT[theme]]}`}
    >
      {LABEL[theme]}
    </Button>
  );
}
