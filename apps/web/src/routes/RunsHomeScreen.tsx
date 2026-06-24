import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ds';
import { RunCard } from '../components/run/RunCard';
import { useRunClient } from '../data/RunClientProvider';
import type { RunSummary } from '../data/runClient';

/**
 * RunsHomeScreen (FV.2, S0) — the `/` home: listRuns → a grid of machine-truth-minimal RunCards
 * (StatusBadge + runId + sequenceThrough; no fabricated richness — RunSummary carries none), with
 * status-derived per-card actions (Open live / Replay / Final idea) wired to the router, a New Run
 * CTA → /launch, and the DS Empty/Loading/Error states (never a blank screen, DS rule 5). Read-only
 * over listRuns (rule #2); nav via useNavigate. The dedicated rich cards are a future enrichment TODO.
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
const grid: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
};

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

  return (
    <main aria-label="Doppl runs home" style={shell}>
      <header style={headerRow}>
        <h1 style={title}>Runs</h1>
        <span style={{ marginLeft: 'auto' }}>
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
        <div style={grid}>
          {state.runs.map((run) => (
            <RunCard
              key={run.runId}
              run={run}
              onOpenLive={(id) => navigate(`/runs/${id}`)}
              onReplay={(id) => navigate(`/runs/${id}/replay`)}
              onFinal={(id) => navigate(`/runs/${id}/final`)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
