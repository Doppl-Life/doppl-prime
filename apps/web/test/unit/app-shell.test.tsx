// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/App';

describe('app shell', () => {
  // Bootstrap smoke: proves the React 19 + Vite + happy-dom toolchain mounts the shell end-to-end.
  // FV.2: / now renders the S0 RunsHomeScreen (no "Doppl" heading); the stable shell identity is the
  // AppShell ◆ Doppl wordmark LINK (FV.1), so assert that.
  it('test_app_shell_renders', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: /doppl/i })).toBeTruthy();
  });
});
