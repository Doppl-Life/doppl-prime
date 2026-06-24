// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { RunClientProvider, useRunClient } from '../../../src/data/RunClientProvider';
import type { RunClient } from '../../../src/data/runClient';

afterEach(() => cleanup());

const sentinel = { __sentinel: true } as unknown as RunClient;

function Probe() {
  const client = useRunClient();
  return <div data-testid="probe">{client === sentinel ? 'same' : 'diff'}</div>;
}

describe('RunClientProvider — app-level runClient context (FV.1)', () => {
  // spec(data-layer reuse): useRunClient() returns the SAME app-level instance across route changes
  // (one client per app load — not recreated per route).
  it('test_run_client_context_single_instance', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <RunClientProvider client={sentinel}>
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <Link to="/x">go</Link>
                  <Probe />
                </>
              }
            />
            <Route path="/x" element={<Probe />} />
          </Routes>
        </RunClientProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('same');
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByTestId('probe').textContent).toBe('same'); // same instance after navigation
  });

  // spec(misuse guard): useRunClient() outside a provider throws a clear error (no silent null client).
  it('test_use_run_client_throws_outside_provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bare() {
      useRunClient();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/RunClientProvider/);
    spy.mockRestore();
  });
});
