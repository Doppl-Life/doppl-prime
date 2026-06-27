import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { isRunTerminal } from '../components/run/runControl';
import type { LineageGraphProjection } from '../data/contracts';
import type { RunClient } from '../data/runClient';
import type { EventSourceLike, SseStream, SseStreamOptions } from '../data/sseStream';
import type { RunStore } from '../state/runStore';
import type { RunMode } from '../state/reducer';
import {
  ModeBanner,
  ActivityTicker,
  HealthIndicator,
  RunEnergyGauge,
  LoadingState,
} from '../components/ds';
import type { ModeBannerMode } from '../components/feedback/ModeBanner';
import { StopControl } from '../components/run/StopControl';
import { AgentRoster } from '../components/run/AgentRoster';
import { InspectorDrawer } from '../components/run/InspectorDrawer';
import { NodeInspectorContent } from '../components/run/NodeInspectorContent';
import { ReplayScrubber } from '../components/run/ReplayScrubber';
import { LineageGraph } from '../lineage/LineageGraph';
import { FitnessOverTime } from '../charts/FitnessOverTime';
import { energyBudgetProgress } from '../panels/energyData';
import { selectWinner } from '../panels/finalIdeaData';
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
  // Outer padding === inter-column gap on the sides + bottom; top gets a slightly larger --space-5
  // so the canvas/panes have a touch more breathing room below the nav bar.
  padding: 'var(--space-5) var(--space-4) var(--space-4)',
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
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  minHeight: 0,
};
const railHeading: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  margin: 0,
};
// Banner stays in col 1 (left-rail) so the center + inspector columns both run edge-to-edge
// top→bottom (right under the app nav bar) without the banner clipping either column's top.
const bannerRow: CSSProperties = {
  gridColumn: '1 / 2',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
};
// The ActivityTicker fills its container (height:100%); flex:1 + min-height:0 lets it grow to fill the
// left rail and scroll its live feed INTERNALLY (no fixed 20rem box, no page growth). FV.9 design-review
// owns final placement/legibility — FV.6 lands it wired + rendering. flex-column so the ticker child
// stretches the cross-axis (full rail width); minWidth:0 lets the grid track honor its column max.
const tickerWrap: CSSProperties = {
  flex: 1,
  minHeight: '12rem',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
};
// Tabbed pane in the left rail: a 2-button header + a flex:1 body so the selected tab (Agents OR
// Activity) gets all the remaining rail height. Solves the "Activity is tiny, you scroll forever"
// problem by giving each panel the full vertical budget when active.
const tabsWrap: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};
const tabHeader: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-1)',
  borderBottom: 'thin solid var(--border-subtle)',
};
const tabButtonBase: CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  borderBottom: 'thin solid transparent',
  padding: 'var(--space-2) var(--space-3)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  cursor: 'pointer',
  textAlign: 'center',
};
const tabButtonActive: CSSProperties = {
  ...tabButtonBase,
  color: 'var(--fg-default)',
  borderBottom: 'thin solid var(--accent)',
};
const tabBody: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};
// Winner card — gold/selected token so it draws the eye; clickable to focus the inspector on the
// winning candidate. Sits ABOVE the lineage canvas (not behind a click) so the headline result of the
// run is the first thing the operator sees.
const winnerCard: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--status-selected)',
  borderLeft: 'var(--space-1) solid var(--status-selected)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--fg-default)',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'var(--font-ui)',
  minWidth: 0,
};
const winnerLabel: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--status-selected)',
  flexShrink: 0,
};
const winnerTitle: CSSProperties = {
  fontSize: 'var(--text-label)',
  fontWeight: 600,
  color: 'var(--fg-default)',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};
const winnerGlyph: CSSProperties = {
  fontSize: 'var(--text-h3)',
  color: 'var(--status-selected)',
  flexShrink: 0,
};
// "View details →" affordance at the right edge of the winner banner — the arrow translates on hover
// (see clickable-affordance.css) so it reads unmistakably as a button.
const winnerCta: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
  flexShrink: 0,
};
// "Click any node to inspect" — small persistent hint near the canvas so first-time operators don't
// have to discover the click affordance on their own.
const canvasHint: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-faint)',
  paddingLeft: 'var(--space-1)',
};
// Loading wrap — fills the canvas cell so the LoadingState centers in the available space rather than
// sitting awkwardly at the top.
const loadingWrap: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
// Quiet placeholder shown in place of the Stop button while the store hasn't yet folded enough
// events to derive the run's status — prevents the misleading "Stop run" flash on a completed run.
const controlPlaceholder: CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
  background: 'var(--bg-surface)',
  border: 'thin dashed var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  textAlign: 'center',
};
// "Replay this run" link — shown in the rail when the live view has a terminalized run, so the
// operator can switch into replay mode in one click without knowing the /replay URL pattern.
const replayLink: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-3)',
  background: 'transparent',
  border: 'thin solid var(--info)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--info)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  textDecoration: 'none',
};
// Scrubber confined to col 1 (left-rail) so the center canvas + the inspector both reach the nav
// bar without the bar running across them.
const scrubberRow: CSSProperties = { gridColumn: '1 / 2', display: 'flex' };
// Pane placement: the LEFT rail stays in row 3 with the banner/scrubber above it (rows 1/2). The
// CENTER + INSPECTOR span all three rows so their canvases reach the nav bar.
const paneRow: CSSProperties = { gridRow: 3 };
const centerPane: CSSProperties = {
  gridRow: '1 / -1',
  gridColumn: 2,
  minHeight: 0,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
};
// The inspector pane reaches all four edges of the shell's content box: spans all three rows (so it
// starts right under the app nav bar) and cancels the shell's right + top + bottom padding via
// negative margins so the panel runs viewport-edge to viewport-edge vertically and to the right edge
// horizontally. Internal panel padding still provides comfortable inner spacing.
const inspectorPane: CSSProperties = {
  gridRow: '1 / -1',
  gridColumn: 3,
  minHeight: 0,
  minWidth: 0,
  display: 'flex',
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

  const inspectorOpen = obs.selectedNode != null;
  const shellStyle: CSSProperties = inspectorOpen
    ? shell
    : { ...shell, gridTemplateColumns: 'minmax(auto, 20rem) minmax(0, 1fr)' };

  // Left-rail tab selection — defaults to 'agents'. 'activity' gives the ticker the full rail height;
  // 'fitness' surfaces the run-level FitnessOverTime chart (the most-watched signal during a live run).
  const [leftTab, setLeftTab] = useState<'agents' | 'activity' | 'fitness'>('agents');

  // The selected winner (PD.11 'selected' lineage node) — null until the kernel marks one. Surfaced as
  // a prominent banner above the canvas so the headline result is visible without clicking the node.
  const winner = obs.lineage ? selectWinner(obs.lineage) : null;
  // When the live view has a terminalized run, surface a "Replay this run" affordance in the rail
  // so the operator can switch into scrubable replay mode without having to know the URL pattern.
  const isTerminalRunStatus = obs.runStatus !== undefined && isRunTerminal(obs.runStatus);

  return (
    <main aria-label="Doppl organism view" style={shellStyle}>
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
        {/* Hold the Stop button until the store has folded enough events to know the run's status —
            otherwise the default "active" state flashes a red Stop affordance for a completed run
            and the operator briefly thinks they can stop it. */}
        {obs.runStatus !== undefined ? (
          <StopControl runId={runId} store={obs.store} runClient={runClient} />
        ) : (
          <div style={controlPlaceholder} aria-live="polite">
            Loading run state…
          </div>
        )}
        {mode === 'live' && isTerminalRunStatus && (
          <Link to={`/runs/${runId}/replay`} style={replayLink}>
            <span aria-hidden="true">⏮</span> Replay this run
          </Link>
        )}
        <HealthIndicator health={healthSummary} status={healthStatus} mode={mode} />
        <RunEnergyGauge spent={energy.spent} budget={energy.budget ?? 0} mode={mode} />
        <div style={tabsWrap}>
          <div role="tablist" aria-label="Left rail panels" style={tabHeader}>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'agents'}
              style={leftTab === 'agents' ? tabButtonActive : tabButtonBase}
              onClick={() => setLeftTab('agents')}
            >
              Agents
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'activity'}
              style={leftTab === 'activity' ? tabButtonActive : tabButtonBase}
              onClick={() => setLeftTab('activity')}
            >
              Activity
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'fitness'}
              style={leftTab === 'fitness' ? tabButtonActive : tabButtonBase}
              onClick={() => setLeftTab('fitness')}
            >
              Fitness
            </button>
          </div>
          <div role="tabpanel" style={tabBody}>
            {leftTab === 'agents' && (
              <AgentRoster
                lineage={obs.lineage}
                onSelect={(dataRef) => obs.setSelectedNode({ dataRef, type: 'agenome' })}
              />
            )}
            {leftTab === 'activity' && (
              <div style={tickerWrap}>
                {/* Tab button already says "Activity" — suppress the ticker's own duplicate heading. */}
                <ActivityTicker events={tickerEvents} mode={mode} title="" />
              </div>
            )}
            {leftTab === 'fitness' && (
              <div style={tickerWrap}>
                <FitnessOverTime events={panelEvents} />
              </div>
            )}
          </div>
        </div>
      </section>

      <section style={{ ...center, ...centerPane }}>
        {winner !== null && (
          <button
            type="button"
            className="winner-banner"
            style={winnerCard}
            aria-label={`Winning idea: ${winner.label}. Click to view details.`}
            onClick={() => obs.setSelectedNode({ dataRef: winner.dataRef, type: 'candidate' })}
          >
            <span style={winnerGlyph} aria-hidden="true">
              ♔
            </span>
            <span style={winnerLabel}>Winning idea</span>
            <span style={winnerTitle}>{winner.label}</span>
            <span style={winnerCta} aria-hidden="true">
              View details
              <span className="winner-arrow">→</span>
            </span>
          </button>
        )}
        {obs.lineage === null ? (
          // Lineage projection rebuild can take seconds for a long replay (1000s of events). Show
          // a clear loading state — and a count of events already folded in — so the operator
          // never sees an empty "0 nodes" canvas that reads as broken.
          <div style={loadingWrap}>
            <LoadingState
              shape="card"
              label={
                mode === 'replay'
                  ? `Loading replay${
                      obs.fold.events.length > 0
                        ? ` (${obs.fold.events.length.toLocaleString()} events loaded)`
                        : ''
                    }…`
                  : 'Loading run…'
              }
            />
          </div>
        ) : (
          <>
            <span style={canvasHint} aria-hidden="true">
              Tip: click any node {winner !== null && 'or the banner above '}to open its details.
            </span>
            <LineageGraph
              projection={obs.lineage}
              events={panelEvents}
              onNodeClick={(_id, dataRef, type) => obs.setSelectedNode({ dataRef, type })}
            />
          </>
        )}
      </section>

      {inspectorOpen && (
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
      )}
    </main>
  );
}

/** A pre-lineage placeholder projection so the CENTER pane mounts before the first fetch resolves. */
function emptyLineage(runId: string): LineageGraphProjection {
  return { runId, nodes: [], edges: [], sequenceThrough: 0 };
}
