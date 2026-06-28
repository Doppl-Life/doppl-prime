import { useCallback, useEffect, useState } from 'react';

/**
 * useTheme — the dark / high-contrast / light theme cycle (FV.1, ARCHITECTURE.md §12). Applies the
 * theme as a class on `document.documentElement` (matching the DS `:root.hc` / `:root.light` scopes;
 * dark is the bare `:root` default), persists the choice to `localStorage['doppl-theme']`, and
 * restores it on boot (high-contrast default when unset/invalid). The DS theme transition is instant — the
 * global prefers-reduced-motion guard (tokens/base.css) already neutralizes any animation.
 */
export type Theme = 'dark' | 'hc' | 'light';

export const THEME_ORDER: readonly Theme[] = ['dark', 'hc', 'light'];
export const THEME_STORAGE_KEY = 'doppl-theme';

function isTheme(value: string | null): value is Theme {
  return value === 'dark' || value === 'hc' || value === 'light';
}

/** Read the persisted theme; an unset/invalid value falls back to the high-contrast default. */
export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : 'hc';
  } catch {
    return 'hc';
  }
}

/** Apply the theme scope class to <html> — dark = no class, hc/light = the matching DS scope. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('hc', 'light');
  if (theme !== 'dark') root.classList.add(theme);
}

export function useTheme(): { theme: Theme; cycle: () => void } {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* persistence is best-effort — a storage failure must never crash the app */
    }
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((current) => THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length]!);
  }, []);

  return { theme, cycle };
}
