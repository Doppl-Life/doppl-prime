import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { LineageGraphProjection } from '../data/contracts';
import type { RunClient } from '../data/runClient';
import type { EventSourceLike, SseStream, SseStreamOptions } from '../data/sseStream';
import type { RunStore } from '../state/runStore';
import type { RunMode } from '../state/reducer';
import { ModeBanner, ActivityTicker, HealthIndicator, RunEnergyGauge } from '../components/ds';
import type { ModeBannerMode } from '../components/feedback/ModeBanner';
import { StopControl } from '../components/run/StopControl';
import { AgentRoster } from '../components/run/AgentRoster';
import { InspectorDrawer } from '../components/run/InspectorDrawer';
import { NodeInspectorContent } from '../components/run/NodeInspectorContent';
import { ReplayScrubber } from '../components/run/ReplayScrubber';
import { LineageGraph } from '../lineage/LineageGraph';
import { FitnessOverTime } from '../charts/FitnessOverTime';
import { EnergyPanel } from '../panels/EnergyPanel';
import { energyBudgetProgress } from '../panels/energyData';
import { useRunObservatory } from './useRunObservatory';
import { deriveHealthStatus, deriveTickerEvents, toHealthSummary } from './observatoryTelemetry';
import { foldAtStep } from './replayScrubber';

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

// Cockpit containment: the run view is clamped to the viewport so streaming content NEVER grows the
// page. The AppShell header is sticky — its height = --space-3 (top pad) + --space-3 (bottom pad) +
// --text-h3-lh (wordmark line); the hairline border is sub-pixel-negligible. The main fills the rest of
// the viewport, and each pane scrolls INDEPENDENTLY (min-height:0 unlocks the grid track so children
// overflow internally rather than the page). Token-only calc — no raw lengths (DS rule 3/5 adherence).
const APP_HEADER_H = 'calc(var(--space-3) + var(--space-3) + var(--text-h3-lh))';
const shell: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(auto, 20rem) minmax(0, 1fr) minmax(auto, 26rem)',
  gridTemplateRows: 'auto auto 1fr',
  gap: 'var(--space-4)',
  padding: 'var(--space-5)',
  alignItems: 'stretch',
  height: `calc(100vh - ${APP_HEADER_H})`,
  minHeight: 0,
  boxSizing: 'border-box',
  overflow: 'hidden',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
};
const leftRail: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  minHeight: 0,
  overflowY: 'auto',
};
const center: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
  alignContent: 'start',
  minHeight: 0,
  overflowY: 'auto',
};
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
// The ActivityTicker fills its container (height:100%); flex:1 + min-height:0 lets it grow to fill the
// left rail and scroll its live feed INTERNALLY (no fixed 20rem box, no page growth). FV.9 design-review
// owns final placement/legibility — FV.6 lands it wired + rendering.
const tickerWrap: CSSProperties = { flex: 1, minHeight: '12rem', display: 'flex' };
const scrubberRow: CSSProperties = { gridColumn: '1 / -1', display: 'flex' };
// Pane placement: the banner (+ optional scrubber) live in the auto rows; the three panes share the
// 1fr row so they fill the remaining viewport and each scrolls independently.
const paneRow: CSSProperties = { gridRow: 3 };
const inspectorPane: CSSProperties = { gridRow: 3, minHeight: 0, overflowY: 'auto' };

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

  // FV.8 replay scrubber — re-fold events[0..N] CLIENT-SIDE (pure foldAtStep — NO refetch/provider,
  // rule #7) so the room can step through a recorded run. Replay-mode-only; the live path is unchanged
  // (panelEvents === obs.fold.events, foldAtStep never called). Default = END (full run shown first;
  // scrub BACK to step through). The lineage node-structure stays full API-projected — only its
  // in-flight overlay rewinds via the prefix events (per-step node reconstruction = FV.9/later).
  const isReplay = mode === 'replay';
  const totalSteps = obs.fold.events.length;
  const [scrubStep, setScrubStep] = useState<number | null>(null);
  const effectiveStep = scrubStep ?? totalSteps;
  const panelEvents = isReplay
    ? foldAtStep(obs.fold.events, effectiveStep).events
    : obs.fold.events;

  // FV.6 live telemetry — PURE selectors over the (possibly step-rewound) fold + the health projection
  // (read-only, rule #9; replay-identical, rule #7). nowMs injected at render keeps the selectors pure.
  const tickerEvents = deriveTickerEvents(panelEvents);
  const healthSummary = toHealthSummary(obs.health, Date.now());
  const healthStatus = deriveHealthStatus(healthSummary);
  const energy = energyBudgetProgress(panelEvents);

  return (
    <main aria-label="Doppl organism view" style={shell}>
      <div style={bannerRow}>
        <ModeBanner mode={bannerMode(obs.store.getMode(), obs.runStatus)} />
      </div>

      {isReplay && (
        <div style={scrubberRow}>
          <ReplayScrubber totalSteps={totalSteps} value={effectiveStep} onChange={setScrubStep} />
        </div>
      )}

      <section aria-label="Organism left rail" style={{ ...leftRail, ...paneRow }}>
        <h3 style={railHeading}>Run controls</h3>
        <StopControl runId={runId} store={obs.store} runClient={runClient} />
        <HealthIndicator health={healthSummary} status={healthStatus} mode={mode} />
        <RunEnergyGauge spent={energy.spent} budget={energy.budget ?? 0} mode={mode} />
        <h3 style={railHeading}>Agent roster</h3>
        <AgentRoster lineage={obs.lineage} />
        <div style={tickerWrap}>
          <ActivityTicker events={tickerEvents} mode={mode} />
        </div>
      </section>

      <section style={{ ...center, ...paneRow }}>
        <LineageGraph
          projection={obs.lineage ?? emptyLineage(runId)}
          events={panelEvents}
          onNodeClick={(_id, dataRef, type) => obs.setSelectedNode({ dataRef, type })}
        />
        <div style={chartStrip}>
          <FitnessOverTime events={panelEvents} />
          <EnergyPanel events={panelEvents} onSelectAgenome={() => undefined} />
        </div>
      </section>

      <div style={inspectorPane}>
        <InspectorDrawer
          selectedId={obs.selectedNode?.dataRef ?? null}
          onClose={() => obs.setSelectedNode(null)}
        >
          <NodeInspectorContent
            selectedNode={obs.selectedNode}
            runId={runId}
            runClient={runClient}
            events={panelEvents}
            lineage={obs.lineage}
          />
        </InspectorDrawer>
      </div>
    </main>
  );
}

/** A pre-lineage placeholder projection so the CENTER pane mounts before the first fetch resolves. */
function emptyLineage(runId: string): LineageGraphProjection {
  return { runId, nodes: [], edges: [], sequenceThrough: 0 };
}
