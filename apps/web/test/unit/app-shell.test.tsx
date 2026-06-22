// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/App';

describe('app shell', () => {
  // Bootstrap smoke: proves the React 19 + Vite + happy-dom toolchain mounts the shell end-to-end.
  it('test_app_shell_renders', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /doppl/i })).toBeTruthy();
  });
});
