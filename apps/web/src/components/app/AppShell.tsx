import type { CSSProperties } from 'react';
import { Link, Outlet, useMatch } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

/**
 * AppShell — the global chrome wrapping every route (FV.1, ARCHITECTURE.md §12): the ◆ Doppl wordmark
 * (links home), a reserved ModeBanner slot (the run banner stays in the Dashboard until FV.4's S2
 * lifts it here — no double-render), a theme toggle, and the route content via <Outlet/>. Adherence:
 * var() tokens only.
 */
const shell: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg-base)',
  color: 'var(--fg-default)',
  fontFamily: 'var(--font-ui)',
};
const chrome: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
  padding: 'var(--space-3) var(--space-5)',
  borderBottom: 'thin solid var(--border-subtle)',
  background: 'var(--bg-surface)',
  position: 'sticky',
  top: 0,
  zIndex: 'var(--z-sticky)',
};
const wordmark: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-h3)',
  fontWeight: 700,
  color: 'var(--fg-default)',
  textDecoration: 'none',
};
const diamond: CSSProperties = { color: 'var(--accent)', textShadow: 'var(--glow-active)' };
const bannerSlot: CSSProperties = {
  flex: 1,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};
const runNav: CSSProperties = { display: 'inline-flex', gap: 'var(--space-3)' };
const navLink: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--accent)',
  textDecoration: 'none',
};

export function AppShell() {
  // When viewing a specific run (any /runs/:id sub-route), surface a contextual nav between the
  // organism view and its knowledge-evolution graph. Absent on the home / launch routes.
  const runMatch = useMatch('/runs/:id/*');
  const runId = runMatch?.params.id;
  return (
    <div style={shell}>
      <header style={chrome}>
        <Link to="/" aria-label="Doppl home" style={wordmark}>
          <span aria-hidden="true" style={diamond}>
            ◆
          </span>{' '}
          Doppl
        </Link>
        {runId !== undefined && runId !== '' && (
          <nav style={runNav} aria-label="Run views">
            <Link to={`/runs/${runId}`} style={navLink}>
              Organism
            </Link>
            <Link to={`/runs/${runId}/knowledge`} style={navLink}>
              Knowledge
            </Link>
          </nav>
        )}
        {/* Reserved ModeBanner slot — filled by the dedicated S2 organism view (FV.4). */}
        <div data-testid="mode-banner-slot" style={bannerSlot} />
        <ThemeToggle />
      </header>
      <Outlet />
    </div>
  );
}
