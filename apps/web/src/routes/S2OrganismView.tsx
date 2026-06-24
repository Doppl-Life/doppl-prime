import type { CSSProperties } from 'react';
import type { LineageGraphProjection } from '../data/contracts';
import type { RunClient } from '../data/runClient';
import type { EventSourceLike, SseStream, SseStreamOptions } from '../data/sseStream';
import type { RunStore } from '../state/runStore';
import type { RunMode } from '../state/reducer';
import { ModeBanner } from '../components/ds';
import type { ModeBannerMode } from '../components/feedback/ModeBanner';
import { StopControl } from '../components/run/StopControl';
import { AgentRoster } from '../components/run/AgentRoster';
import { InspectorDrawer } from '../components/run/InspectorDrawer';
import { LineageGraph } from '../lineage/LineageGraph';
import { FitnessOverTime } from '../charts/FitnessOverTime';
import { EnergyPanel } from '../panels/EnergyPanel';
import { useRunObservatory } from './useRunObservatory';

/**
 * S2OrganismView (FV.4) — the 3-pane organism centerpiece at /runs/:id (live) + /runs/:id/replay
 * (replay). LEFT rail: the run StopControl + the agent roster (from the lineage's agenome nodes).
 * CENTER: the reused LineageGraph, live (it grows on the SSE cadence via the re-homed PD.20 re-fetch),
 * with the fitness/energy charts in a secondary strip below (polished placement = FV.6). RIGHT: the
 * inspector drawer SLOT (empty placeholder + open/close; FV.5 wires node-click → content). The live
 * wiring is the extracted useRunObservatory hook (store + SSE + the debounced re-fetch). Read-only
 * over projections; the only writes are the StopControl's idempotent command (rule #2); replay
 * reconstructs from persisted events (rule #7). LIVE vs REPLAY is unmistakable via the ModeBanner.
 */
export interface S2OrganismViewProps {
  runId: string;
  runClient: RunClient;
  mode?: RunMode;
  baseUrl?: string;
  eventSourceFactory?: (url: string) => EventSourceLike;
  createStream?: (options: SseStreamOptions) => SseStream;
  store?: RunStore;
  refetchDebounceMs?: number;
}

/** Banner state from the store mode + the run's latest run-level RunEventType (mirrors Dashboard). */
function bannerMode(mode: RunMode, runStatus: string | undefined): ModeBannerMode {
  if (mode === 'replay') return 'replay';
  if (runStatus === 'run.completed') return 'complete';
  if (runStatus === 'run.failed') return 'failed';
  if (runStatus === 'run.stopped') return 'stopped';
  return 'live';
}

const shell: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(auto, 20rem) minmax(0, 1fr) minmax(auto, 26rem)',
  gap: 'var(--space-4)',
  padding: 'var(--space-5)',
  alignItems: 'start',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
};
const leftRail: CSSProperties = { display: 'grid', gap: 'var(--space-4)', alignContent: 'start' };
const center: CSSProperties = { display: 'grid', gap: 'var(--space-4)' };
const railHeading: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  margin: 0,
};
const bannerRow: CSSProperties = {
  gridColumn: '1 / -1',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
};
const chartStrip: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(0, 1fr))',
  gap: 'var(--space-4)',
};

export function S2OrganismView({
  runId,
  runClient,
  mode = 'live',
  baseUrl = '/api',
  eventSourceFactory,
  createStream,
  store: injectedStore,
  refetchDebounceMs,
}: S2OrganismViewProps) {
  const obs = useRunObservatory({
    runId,
    mode,
    runClient,
    baseUrl,
    eventSourceFactory,
    createStream,
    store: injectedStore,
    refetchDebounceMs,
  });

  return (
    <main aria-label="Doppl organism view" style={shell}>
      <div style={bannerRow}>
        <ModeBanner mode={bannerMode(obs.store.getMode(), obs.runStatus)} />
      </div>

      <section aria-label="Organism left rail" style={leftRail}>
        <h3 style={railHeading}>Run controls</h3>
        <StopControl runId={runId} store={obs.store} runClient={runClient} />
        <h3 style={railHeading}>Agent roster</h3>
        <AgentRoster lineage={obs.lineage} />
      </section>

      <section style={center}>
        <LineageGraph projection={obs.lineage ?? emptyLineage(runId)} events={obs.fold.events} />
        <div style={chartStrip}>
          <FitnessOverTime events={obs.fold.events} />
          <EnergyPanel events={obs.fold.events} onSelectAgenome={() => undefined} />
        </div>
      </section>

      <InspectorDrawer
        selectedId={obs.selectedCandidateId}
        onClose={() => obs.setSelectedCandidateId(null)}
      />
    </main>
  );
}

/** A pre-lineage placeholder projection so the CENTER pane mounts before the first fetch resolves. */
function emptyLineage(runId: string): LineageGraphProjection {
  return { runId, nodes: [], edges: [], sequenceThrough: 0 };
}
