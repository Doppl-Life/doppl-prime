import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useMatch } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

const AGARDEN_RUN_CONTEXT_STORAGE_KEY = 'doppl.agarden.selectedRunId';
const AGARDEN_RUN_CONTEXT_EVENT = 'doppl:agarden-run-context';

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
const navLinkBase: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--accent)',
  textDecoration: 'none',
  padding: 'var(--space-1) var(--space-2)',
  borderRadius: 'var(--radius-sm)',
};
const navLinkActive: CSSProperties = {
  ...navLinkBase,
  background: 'var(--accent-soft)',
  color: 'var(--fg-default)',
};

export function AppShell() {
  // Organism/Knowledge are per-run views — only meaningful when we're actually viewing a run.
  // Agarden is a global outer artifact view, but showing it here gives run-view users the same
  // top-level switchboard without changing the inner Organism/Knowledge routes.
  // On the runs list / launcher / etc. they'd be context-less and confusing, so we hide them.
  // NavLink (vs Link) highlights the active tab so repeat clicks read as no-ops, not page reloads.
  const runMatch = useMatch('/runs/:id/*');
  const agardenMatch = useMatch('/agarden');
  const runId = runMatch?.params.id;
  const [agardenRunId, setAgardenRunId] = useState<string | null>(() =>
    readAgardenRunContext(),
  );
  const navRunId = runId !== undefined && runId !== '' ? runId : agardenRunId;
  const styleFn = ({ isActive }: { isActive: boolean }) => (isActive ? navLinkActive : navLinkBase);

  useEffect(() => {
    const onAgardenRunContext = (event: Event) => {
      const runId =
        event instanceof CustomEvent && typeof event.detail?.runId === 'string'
          ? event.detail.runId
          : readAgardenRunContext();
      setAgardenRunId(runId);
    };
    window.addEventListener(AGARDEN_RUN_CONTEXT_EVENT, onAgardenRunContext);
    return () => window.removeEventListener(AGARDEN_RUN_CONTEXT_EVENT, onAgardenRunContext);
  }, []);

  return (
    <div style={shell}>
      <header style={chrome}>
        <Link to="/" aria-label="Doppl home" style={wordmark}>
          <span aria-hidden="true" style={diamond}>
            ◆
          </span>{' '}
          Doppl
        </Link>
        {navRunId !== null && (
          <nav style={runNav} aria-label="Run views">
            <NavLink to={`/runs/${navRunId}`} end style={styleFn}>
              Organism
            </NavLink>
            <NavLink to={`/runs/${navRunId}/knowledge`} style={styleFn}>
              Knowledge
            </NavLink>
            <NavLink to="/agarden" style={agardenMatch === null ? styleFn : () => navLinkActive}>
              Agarden
            </NavLink>
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

function readAgardenRunContext(): string | null {
  try {
    const runId = window.localStorage.getItem(AGARDEN_RUN_CONTEXT_STORAGE_KEY);
    return runId === null || runId.trim() === '' ? null : runId;
  } catch {
    return null;
  }
}
