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
import { isRunTerminal, selectRunStatus } from '../components/run/runControl';
import { debounce } from '../lib/debounce';
import { ModeBanner } from '../components/feedback/ModeBanner';
import type { ModeBannerMode } from '../components/feedback/ModeBanner';
import { RunConfigPanel } from '../components/run/RunConfigPanel';
import { OperatorPromptPanel } from '../components/demo/OperatorPromptPanel';
import { FallbackLadderPanel } from '../components/demo/FallbackLadderPanel';
import { RunHealthPanel } from '../components/demo/RunHealthPanel';
import { StopControl } from '../components/run/StopControl';
import { RunListPanel } from '../components/run/RunListPanel';
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
  /** PD.20 — debounce window (ms) for the live lineage/health re-fetch; injected small in tests. */
  refetchDebounceMs?: number;
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

/** Module-stable default so the shell effect's deps don't churn every render (an inline default would
 *  be a new function each render → effect re-run loop). Tests inject their own factory. */
const defaultEventSourceFactory = (url: string): EventSourceLike => new EventSource(url);

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
  mode: modeProp = 'live',
  baseUrl = '/api',
  eventSourceFactory = defaultEventSourceFactory,
  createStream = createSseStream,
  store: injectedStore,
  refetchDebounceMs = 600,
}: DashboardProps) {
  const [observedRunId, setObservedRunId] = useState(runId);
  // PD.17 — `mode` is run-switchable STATE (was a static prop): browsing a past run (the run-list or the
  // fallback replay rung) observes it in REPLAY mode; starting a fresh run returns to LIVE. Mode is a
  // non-folded §2 label (the live/replay fold is identical) — only the ModeBanner reads it; the store
  // recreates on either an observedRunId OR a mode change.
  const [mode, setMode] = useState<RunMode>(modeProp);
  const observeReplay = (id: string): void => {
    setMode('replay');
    setObservedRunId(id);
  };
  const observeLive = (id: string): void => {
    setMode('live');
    setObservedRunId(id);
  };
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
    // PD.20 — the evolving projections (lineage + health) are REBUILT-ON-READ by the API (§9); re-fetch
    // them on the live SSE cadence so the graph grows live. A ONE-TIME fetch renders stale (the run
    // evolves in the backend but the dashboard froze at 1 node — PD.15 fixed event delivery, not the
    // projection rebuild). Run STATE stays live via the store SSE-fold (no double-fold here).
    const refetchProjections = (): void => {
      runClient
        .getLineage(observedRunId)
        .then((l) => active && setLineage(l))
        .catch(() => undefined);
      runClient
        .getRunHealth(observedRunId)
        .then((h) => active && setHealth(h))
        .catch(() => undefined);
    };
    const debouncedRefetch = debounce(refetchProjections, refetchDebounceMs);

    // Seed the raw events fold + the initial projections.
    runClient
      .getEvents(observedRunId)
      .then((evs) => active && setFold((prev) => foldEvents(evs, prev)))
      .catch(() => undefined);
    refetchProjections();

    // Wire the deferred SSE-store IoC: store.applyEvent sink + poll fallback + resync-on-mount, and
    // accumulate the raw events FoldState the panels consume (delivery-level dedup).
    const stream = wireRunStream({
      store,
      runId: observedRunId,
      baseUrl,
      eventSourceFactory,
      createStream,
      onEnvelope: (env) => {
        setFold((f) => applyEnvelope(f, env));
        // PD.20 — re-fetch the evolving projections on the SSE cadence (debounced — no hammering during
        // an event burst); a TERMINAL envelope forces an immediate final re-fetch so the FINAL graph
        // always renders even if debounced updates were coalesced.
        if (isRunTerminal(env.type)) {
          debouncedRefetch.cancel();
          refetchProjections();
        } else {
          debouncedRefetch();
        }
      },
    });

    return () => {
      active = false;
      debouncedRefetch.cancel();
      stream.close();
    };
  }, [
    observedRunId,
    store,
    runClient,
    baseUrl,
    eventSourceFactory,
    createStream,
    refetchDebounceMs,
  ]);

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

      {/* PD.6 — the continue-vs-switch health surface (signal + a colorblind-safe stale/absent flag),
          extracted from the inline healthRow. Shown for the observed run; absent health is flagged. */}
      {observedRunId && <RunHealthPanel health={health} />}

      <div style={grid}>
        {/* PD.17 — the run-list / replay browser: browse past runs (GET /runs) → click → observe that run
            in REPLAY mode (observeReplay; the shared replay-switch the fallback rung also uses). */}
        <Panel title="Runs">
          <RunListPanel
            runClient={runClient}
            onReplay={observeReplay}
            observedRunId={observedRunId}
          />
        </Panel>

        <Panel title="Run">
          {/* PD.5b — the demo-forward operator-prompt path (prepared/freeform → partial {seed}); the
              full-control RunConfigPanel stays alongside. A fresh start observes the new run in LIVE mode. */}
          <OperatorPromptPanel runClient={runClient} onStarted={(run) => observeLive(run.runId)} />
          {/* PD.12 — the operator 3-rung demo fallback ladder (low-cap-live · prepared · replay); start a
              rung's run (LIVE) or mount the recorded replay (REPLAY — observeReplay, the shared switch). */}
          <FallbackLadderPanel
            runClient={runClient}
            onStarted={(run) => observeLive(run.runId)}
            onReplay={observeReplay}
          />
          <RunConfigPanel runClient={runClient} onStarted={(run) => observeLive(run.runId)} />
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
              mode={store.getMode()}
              runStatus={runStatus}
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
