import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { useRunClient } from '../../data/RunClientProvider';
import type { RunSummary } from '../../data/runClient';
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
const navButton: CSSProperties = {
  ...navLinkBase,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
};
const navButtonActive: CSSProperties = {
  ...navLinkActive,
  border: 0,
  cursor: 'pointer',
};
const CALIBRATOR_URL = 'https://doppl-life.github.io/doppl-prime/calibrator/';

export function AppShell() {
  const navigate = useNavigate();
  const runClient = useRunClient();
  // Agarden and Organism are global top-level views: Agarden opens the outer artifact map, while
  // Organism opens the newest completed inner run. Knowledge remains per-run, so it appears only
  // after a run context is known.
  const runMatch = useMatch('/runs/:id/*');
  const agardenMatch = useMatch('/agarden');
  const runId = runMatch?.params.id;
  const [agardenRunId, setAgardenRunId] = useState<string | null>(() =>
    readAgardenRunContext(),
  );
  const [isOpeningOrganism, setIsOpeningOrganism] = useState(false);
  const navRunId = runId !== undefined && runId !== '' ? runId : agardenRunId;
  const styleFn = ({ isActive }: { isActive: boolean }) => (isActive ? navLinkActive : navLinkBase);
  const organismActive = runMatch !== null && !window.location.pathname.endsWith('/knowledge');
  const knowledgeActive = runMatch !== null && window.location.pathname.endsWith('/knowledge');

  const openLatestCompletedRun = async (target: 'organism' | 'knowledge') => {
    if (isOpeningOrganism) return;
    setIsOpeningOrganism(true);
    try {
      const runs = await runClient.listRuns();
      const latestCompleted = findLatestCompletedRun(runs);
      if (latestCompleted) {
        navigate(
          target === 'knowledge'
            ? `/runs/${latestCompleted.runId}/knowledge`
            : `/runs/${latestCompleted.runId}`,
        );
      } else {
        navigate('/', {
          state: {
            preferredRunFilter: 'complete',
            notice: `No completed runs yet. Complete a run, then ${target === 'knowledge' ? 'Knowledge' : 'Organism'} will open the newest result.`,
          },
        });
      }
    } catch {
      navigate('/', {
        state: {
          notice: 'Could not load completed runs. Try refreshing the runs page.',
        },
      });
    } finally {
      setIsOpeningOrganism(false);
    }
  };

  const openOrganism = () => openLatestCompletedRun('organism');
  const openKnowledge = () => {
    if (navRunId !== null) navigate(`/runs/${navRunId}/knowledge`);
    else void openLatestCompletedRun('knowledge');
  };

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
        <nav style={runNav} aria-label="Run views">
          <NavLink to="/agarden" style={agardenMatch === null ? styleFn : () => navLinkActive}>
            Agarden
          </NavLink>
          <button
            type="button"
            style={organismActive ? navButtonActive : navButton}
            onClick={openOrganism}
            disabled={isOpeningOrganism}
          >
            Organism
          </button>
          <button
            type="button"
            style={knowledgeActive ? navButtonActive : navButton}
            onClick={openKnowledge}
            disabled={isOpeningOrganism}
          >
            Knowledge
          </button>
          <a
            href={CALIBRATOR_URL}
            target="_blank"
            rel="noreferrer"
            style={navLinkBase}
          >
            Calibrator
          </a>
        </nav>
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

function findLatestCompletedRun(runs: readonly RunSummary[]): RunSummary | null {
  return [...runs]
    .filter((run) => run.status === 'completed')
    .sort((a, b) => compareRunRecencyDesc(a, b))[0] ?? null;
}

function compareRunRecencyDesc(a: RunSummary, b: RunSummary): number {
  const aTime = parseRunTime(a.createdAt);
  const bTime = parseRunTime(b.createdAt);
  if (aTime !== bTime) return bTime - aTime;
  return b.sequenceThrough - a.sequenceThrough;
}

function parseRunTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
