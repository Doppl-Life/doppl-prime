import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ds';
import { RunsTable } from '../components/run/RunsTable';
import { RunsKpiStrip } from '../components/run/RunsKpiStrip';
import { RunsFilterBar } from '../components/run/RunsFilterBar';
import {
  countByFilter,
  DEFAULT_SORT,
  filterRuns,
  isDefaultSort,
  nextSort,
  sortRuns,
} from '../components/run/runsSummary';
import type { RunFilter, SortKey, SortState } from '../components/run/runsSummary';
import { useRunClient } from '../data/RunClientProvider';
import type { RunSummary } from '../data/runClient';

/**
 * RunsHomeScreen (FV.2, S0) — the `/` home: listRuns → a KPI summary strip, a status/search filter
 * toolbar, and a date-grouped RunsTable (one row per run with its metadata + a status-derived Replay /
 * Open-live action). Filtering and search are client-side over the already-loaded list (no refetch).
 * The backend serves the enriched RunSummary sorted newest-first. A New Run CTA → /launch, and the DS
 * Empty/Loading/Error states (never a blank screen, DS rule 5). Read-only over listRuns (rule #2).
 */
type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly runs: readonly RunSummary[] };

const shell: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-5)',
  padding: 'var(--space-5)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
};
const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
};
const title: CSSProperties = { fontSize: 'var(--text-h2)', margin: 0 };
const controls: CSSProperties = { display: 'grid', gap: 'var(--space-4)' };
const noMatch: CSSProperties = {
  padding: 'var(--space-6)',
  textAlign: 'center',
  color: 'var(--fg-muted)',
  fontFamily: 'var(--font-ui)',
};

// Persisted view preferences (filter · search · sort) so the table opens the way you left it.
const VIEW_KEY = 'doppl.runs.view.v1';
interface ViewPrefs {
  filter: RunFilter;
  query: string;
  sort: SortState;
}
const FILTERS: readonly RunFilter[] = ['all', 'running', 'complete', 'failed'];
const SORT_KEYS: readonly SortKey[] = ['time', 'problem', 'status', 'cands', 'gens', 'fitness'];
function loadView(): ViewPrefs {
  const fallback: ViewPrefs = { filter: 'all', query: '', sort: DEFAULT_SORT };
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw === null) return fallback;
    const p = JSON.parse(raw) as Partial<ViewPrefs>;
    const filter = FILTERS.includes(p.filter as RunFilter) ? (p.filter as RunFilter) : 'all';
    const query = typeof p.query === 'string' ? p.query : '';
    const key = p.sort && SORT_KEYS.includes(p.sort.key) ? p.sort.key : DEFAULT_SORT.key;
    const dir = p.sort?.dir === 'asc' || p.sort?.dir === 'desc' ? p.sort.dir : DEFAULT_SORT.dir;
    return { filter, query, sort: { key, dir } };
  } catch {
    return fallback;
  }
}
function saveView(prefs: ViewPrefs): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable (private mode / quota) — preferences just won't persist.
  }
}

export function RunsHomeScreen() {
  const runClient = useRunClient();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const initial = useRef(loadView()).current;
  const [filter, setFilter] = useState<RunFilter>(initial.filter);
  const [query, setQuery] = useState(initial.query);
  const [sort, setSort] = useState<SortState>(initial.sort);

  useEffect(() => {
    saveView({ filter, query, sort });
  }, [filter, query, sort]);

  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    runClient
      .listRuns()
      .then((runs) => active && setState({ kind: 'ready', runs }))
      .catch(() => active && setState({ kind: 'error' }));
    return () => {
      active = false;
    };
  }, [runClient, reloadKey]);

  const allRuns = state.kind === 'ready' ? state.runs : [];
  const counts = useMemo(() => countByFilter(allRuns), [allRuns]);
  const visibleRuns = useMemo(
    () => sortRuns(filterRuns(allRuns, filter, query), sort),
    [allRuns, filter, query, sort],
  );
  const onSort = (key: SortKey) => setSort((s) => nextSort(s, key));

  const newRun = () => navigate('/launch');
  const reload = () => setReloadKey((k) => k + 1);
  // Default destination when clicking a row: the primary view for that run's status.
  // running/completing → live observatory; completed/stopped/failed/cancelled → replay;
  // anything else (e.g. configured) → the same generic observe URL.
  const openCard = (id: string, status: string | null) => {
    if (status === 'running' || status === 'completing') navigate(`/runs/${id}`);
    else if (status === 'completed' || status === 'stopped') navigate(`/runs/${id}/replay`);
    else if (status === 'failed' || status === 'cancelled') navigate(`/runs/${id}/replay`);
    else navigate(`/runs/${id}`);
  };

  return (
    <main aria-label="Doppl runs home" style={shell}>
      <header style={headerRow}>
        <h1 style={title}>Runs</h1>
        <span style={{ marginLeft: 'auto' }}>
          <Button variant="secondary" glyph="✺" onClick={() => navigate('/agarden')}>
            Agarden
          </Button>{' '}
          <Button variant="primary" glyph="◆" onClick={newRun}>
            New Run
          </Button>
        </span>
      </header>

      {state.kind === 'loading' && <LoadingState shape="card" label="Loading runs…" />}

      {state.kind === 'error' && (
        <ErrorState title="Failed to load runs" detail="GET /runs failed" onRetry={reload} />
      )}

      {state.kind === 'ready' && state.runs.length === 0 && (
        <EmptyState
          icon="◌"
          title="No runs yet"
          description="Start your first run to watch the organism evolve."
        />
      )}

      {state.kind === 'ready' && state.runs.length > 0 && (
        <>
          <RunsKpiStrip runs={state.runs} />
          <div style={controls}>
            <RunsFilterBar
              filter={filter}
              query={query}
              counts={counts}
              onFilter={setFilter}
              onSearch={setQuery}
            />
            {visibleRuns.length > 0 ? (
              <RunsTable
                runs={visibleRuns}
                onOpen={openCard}
                onReplay={(id) => navigate(`/runs/${id}/replay`)}
                onOpenLive={(id) => navigate(`/runs/${id}`)}
                sort={sort}
                onSort={onSort}
                grouped={isDefaultSort(sort)}
              />
            ) : (
              <p style={noMatch} role="status">
                No runs match the current filter.
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
