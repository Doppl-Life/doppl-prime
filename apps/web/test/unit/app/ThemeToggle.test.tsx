// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from '../../../src/components/app/ThemeToggle';

function reset() {
  cleanup();
  document.documentElement.className = '';
  localStorage.clear();
}
beforeEach(reset);
afterEach(reset);

describe('ThemeToggle + useTheme — dark/hc/light cycle, persisted to localStorage', () => {
  // spec(§12): the toggle cycles from the high-contrast default, applies the matching class to document.documentElement
  // (the DS :root.hc / :root.light scopes), and persists the choice to localStorage['doppl-theme'].
  it('test_theme_toggle_applies_class_and_persists', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /theme/i });
    // boot default = high contrast
    expect(document.documentElement.classList.contains('hc')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);

    fireEvent.click(btn); // → light
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('hc')).toBe(false);
    expect(localStorage.getItem('doppl-theme')).toBe('light');

    fireEvent.click(btn); // → back to dark
    expect(document.documentElement.classList.contains('hc')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(localStorage.getItem('doppl-theme')).toBe('dark');

    fireEvent.click(btn); // → back to hc
    expect(document.documentElement.classList.contains('hc')).toBe(true);
    expect(localStorage.getItem('doppl-theme')).toBe('hc');
  });

  // spec(§12): a persisted theme is restored on boot; an unset/invalid value → the high-contrast default.
  it('test_theme_restored_on_boot', () => {
    localStorage.setItem('doppl-theme', 'light');
    render(<ThemeToggle />);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    reset();

    localStorage.setItem('doppl-theme', 'bogus-value');
    render(<ThemeToggle />);
    expect(document.documentElement.classList.contains('hc')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });
});
