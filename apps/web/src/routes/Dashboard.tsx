import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { LineageGraphProjection } from '../data/contracts';
import type { RunClient } from '../data/runClient';
import type { RunHealth } from '../data/health';
import { applyEnvelope, createSseStream, emptyFoldState, foldEvents } from '../data/sseStream';
import type { EventSourceLike, FoldState, SseStream, SseStreamOptions } from '../data/sseStream';
import { createRunStore } from '../state/runStore';
import type { RunStore } from '../state/runStore';
import type { RunMode } from '../state/reducer';
import { selectRunStatus } from '../components/run/runControl';
import { ModeBanner } from '../components/feedback/ModeBanner';
import type { ModeBannerMode } from '../components/feedback/ModeBanner';
import { RunConfigPanel } from '../components/run/RunConfigPanel';
import { StopControl } from '../components/run/StopControl';
import { LineageGraph } from '../lineage/LineageGraph';
import { FitnessOverTime } from '../charts/FitnessOverTime';
import { GenerationComparison } from '../charts/GenerationComparison';
import { EnergyPanel } from '../panels/EnergyPanel';
import { CandidateInspector } from '../panels/CandidateInspector';
import { CriticGauntletPanel } from '../panels/CriticGauntletPanel';
import { SubtypeCheckPanel } from '../panels/SubtypeCheckPanel';
import { FinalIdeaPanel } from '../panels/FinalIdeaPanel';
import { selectWinner } from '../panels/finalIdeaData';
import { wireRunStream } from './dashboardWiring';

/**
 * Dashboard — the §12 operator shell + the live-data wiring capstone. It constructs the run-store (P7.2)
 * + the sseStream and wires the DEFERRED IoC (`dashboardWiring.wireRunStream`: onEvent→store.applyEvent,
 * onError→store.poll, resync-on-mount — LESSONS §2), accumulates the raw events FoldState the panels need
 * (delivery-level dedup; the lean store keeps only ViewState), and composes the full panel set
 * (P7.5–P7.13) via their dataRef/candidateId link targets (link-not-embed). Mounts the global ModeBanner
 * (P7.4), the run-health panel (P6.8), and a static secret-redaction trust indicator (§13 — never a
 * secret). Read-only over projections + SSE; the only writes are the contract commands the launcher/stop
 * already issue (rule #2). Wired against the INJECTED data-client + fixtures; live-producer confirms land
 * at the demo→cody merge.
 */
export interface DashboardProps {
  runId: string;
  runClient: RunClient;
  mode?: RunMode;
  baseUrl?: string;
  eventSourceFactory?: (url: string) => EventSourceLike;
  /** Injected for tests; defaults to the real createSseStream (via wireRunStream). */
  createStream?: (options: SseStreamOptions) => SseStream;
  /** Injected for tests; defaults to a fresh createRunStore. */
  store?: RunStore;
}

const shell: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-5)',
  padding: 'var(--space-5)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
  background: 'var(--bg-base)',
};
const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
  flexWrap: 'wrap',
};
const trust: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--success)',
};
const healthRow: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-4)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const grid: CSSProperties = { display: 'grid', gap: 'var(--space-5)' };
const panelCard: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-2)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-4)',
};
const panelTitle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  margin: 0,
};

/** Banner state from the store mode + the run's latest run-level RunEventType (no RunStatus needed). */
function bannerMode(mode: RunMode, runStatus: string | undefined): ModeBannerMode {
  if (mode === 'replay') return 'replay';
  if (runStatus === 'run.completed') return 'complete';
  if (runStatus === 'run.failed') return 'failed';
  if (runStatus === 'run.stopped') return 'stopped';
  return 'live';
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={panelCard}>
      <h3 style={panelTitle}>{title}</h3>
      {children}
    </section>
  );
}

export function Dashboard({
  runId,
  runClient,
  mode = 'live',
  baseUrl = '/api',
  eventSourceFactory = (url) => new EventSource(url),
  createStream = createSseStream,
  store: injectedStore,
}: DashboardProps) {
  const [observedRunId, setObservedRunId] = useState(runId);
  const store = useMemo(
    () => injectedStore ?? createRunStore({ runId: observedRunId, runClient, mode }),
    [injectedStore, observedRunId, runClient, mode],
  );

  const [fold, setFold] = useState<FoldState>(emptyFoldState);
  const [lineage, setLineage] = useState<LineageGraphProjection | null>(null);
  const [health, setHealth] = useState<RunHealth | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const state = useSyncExternalStore(store.subscribe, store.getState);

  useEffect(() => {
    if (!observedRunId) return;
    let active = true;
    runClient
      .getEvents(observedRunId)
      .then((evs) => active && setFold((prev) => foldEvents(evs, prev)))
      .catch(() => undefined);
    runClient
      .getLineage(observedRunId)
      .then((l) => active && setLineage(l))
      .catch(() => undefined);
    runClient
      .getRunHealth(observedRunId)
      .then((h) => active && setHealth(h))
      .catch(() => undefined);
    // Wire the deferred SSE-store IoC: store.applyEvent sink + poll fallback + resync-on-mount, and
    // accumulate the raw events FoldState the panels consume (delivery-level dedup).
    const stream = wireRunStream({
      store,
      runId: observedRunId,
      baseUrl,
      eventSourceFactory,
      createStream,
      onEnvelope: (env) => setFold((f) => applyEnvelope(f, env)),
    });

    return () => {
      active = false;
      stream.close();
    };
  }, [observedRunId, store, runClient, baseUrl, eventSourceFactory, createStream]);

  const runStatus = selectRunStatus(state, observedRunId);
  const winnerRef = useMemo(
    () => (lineage ? (selectWinner(lineage)?.dataRef ?? null) : null),
    [lineage],
  );
  const activeCandidateId = selectedCandidateId ?? winnerRef;

  return (
    <main aria-label="Doppl run observatory" style={shell}>
      <header style={header}>
        <h1 style={{ fontSize: 'var(--text-h2)', margin: 0 }}>Doppl — Run Observatory</h1>
        <ModeBanner mode={bannerMode(store.getMode(), runStatus)} />
        <span role="note" style={trust}>
          <span aria-hidden="true">🛡</span> Secret redaction active — no secrets in payloads
        </span>
      </header>

      {health && (
        <section aria-label="Run health" style={healthRow}>
          <span>generation {health.currentGeneration}</span>
          <span>{health.candidatesInFlight} in flight</span>
          <span>last event {health.lastEventAt ?? '—'}</span>
        </section>
      )}

      <div style={grid}>
        <Panel title="Run">
          <RunConfigPanel runClient={runClient} onStarted={(run) => setObservedRunId(run.id)} />
          {observedRunId && (
            <StopControl runId={observedRunId} store={store} runClient={runClient} />
          )}
        </Panel>

        {lineage && (
          <Panel title="Lineage">
            <LineageGraph projection={lineage} events={fold.events} />
          </Panel>
        )}

        <Panel title="Fitness over time">
          <FitnessOverTime events={fold.events} />
        </Panel>
        <Panel title="Generation comparison">
          <GenerationComparison events={fold.events} />
        </Panel>
        <Panel title="Energy per agenome">
          <EnergyPanel events={fold.events} onSelectAgenome={() => undefined} />
        </Panel>

        {lineage && observedRunId && (
          <Panel title="Final surviving idea">
            <FinalIdeaPanel
              runId={observedRunId}
              lineage={lineage}
              events={fold.events}
              runClient={runClient}
              onSelectLineageNode={setSelectedCandidateId}
            />
          </Panel>
        )}

        {activeCandidateId && observedRunId && (
          <>
            <Panel title="Candidate inspector">
              <CandidateInspector
                runId={observedRunId}
                candidateId={activeCandidateId}
                runClient={runClient}
              />
            </Panel>
            <Panel title="Critic gauntlet">
              <CriticGauntletPanel events={fold.events} candidateId={activeCandidateId} />
            </Panel>
            <Panel title="Subtype checks">
              <SubtypeCheckPanel events={fold.events} candidateId={activeCandidateId} />
            </Panel>
          </>
        )}
      </div>
    </main>
  );
}
