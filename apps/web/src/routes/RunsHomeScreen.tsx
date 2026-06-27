import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ds';
import { RunsTable } from '../components/run/RunsTable';
import { useRunClient } from '../data/RunClientProvider';
import type { RunSummary } from '../data/runClient';

/**
 * RunsHomeScreen (FV.2, S0) — the `/` home: listRuns → a date-sorted RunsTable (one row per run with its
 * metadata — date, problem, final idea, status, and reproduction/cull/mutation activity — plus a Replay /
 * Open-live action). The backend serves the enriched RunSummary sorted newest-first. A New Run CTA →
 * /launch, and the DS Empty/Loading/Error states (never a blank screen, DS rule 5). Read-only over
 * listRuns (rule #2); nav via useNavigate.
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

export function RunsHomeScreen() {
  const runClient = useRunClient();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

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

  const newRun = () => navigate('/launch');
  const reload = () => setReloadKey((k) => k + 1);
  // Default destination when clicking a row: ALWAYS land on the run's organism view (`/runs/:id`)
  // — a completed run still renders its terminal projection there, with a "Replay" affordance to
  // switch into replay mode on demand. (The explicit Replay column button in the table still routes
  // straight to /runs/:id/replay for users who want to skip the intermediate hop.)
  const openCard = (id: string, _status: string | null) => navigate(`/runs/${id}`);

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
        <RunsTable
          runs={state.runs}
          onOpen={openCard}
          onReplay={(id) => navigate(`/runs/${id}/replay`)}
          onOpenLive={(id) => navigate(`/runs/${id}`)}
        />
      )}
    </main>
  );
}
