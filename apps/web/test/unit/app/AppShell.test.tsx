// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../../../src/components/app/AppShell';
import { RunClientProvider } from '../../../src/data/RunClientProvider';
import type { RunClient } from '../../../src/data/runClient';

// AppShell's global nav reads the runClient (listRuns) on click; the chrome render only needs a provider.
const fakeClient = { listRuns: () => Promise.resolve([]) } as unknown as RunClient;

afterEach(() => {
  cleanup();
  document.documentElement.className = '';
  localStorage.clear();
});

describe('AppShell — global chrome layout (FV.1)', () => {
  // spec(§12): the shell renders the ◆ Doppl wordmark (links to /), a theme toggle, and the <Outlet/>
  // (the route content). The wordmark is a link, not a heading (so the screen heading stays singular).
  it('test_app_shell_renders_chrome_and_outlet', () => {
    render(
      <RunClientProvider client={fakeClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>OUTLET_CHILD</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </RunClientProvider>,
    );
    const wordmark = screen.getByRole('link', { name: /doppl/i });
    expect(wordmark.getAttribute('href')).toBe('/'); // wordmark → home
    expect(screen.getByRole('button', { name: /theme/i })).toBeTruthy(); // theme toggle
    expect(screen.getByText('OUTLET_CHILD')).toBeTruthy(); // route content via <Outlet/>
  });
});
