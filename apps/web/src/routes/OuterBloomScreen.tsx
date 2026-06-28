import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, PointerEvent, ReactNode, WheelEvent } from 'react';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ds';
import type { RunClient } from '../data/runClient';
import type { StartRunResult } from '../data/runClient';
import type { OuterBloomIsland, OuterBloomNode, OuterBloomProjection } from '../data/outerBloom';
import { skinValidationQuestion } from '../data/skinValidationQuestions';
import { resolveApiBaseUrl } from '../data/apiBase';
import { createSseStream } from '../data/sseStream';
import type { RunEventEnvelope } from '../data/contracts';
import type { EventSourceLike, SseStream } from '../data/sseStream';
import {
  buildBloomRunConfig,
  canBuildBloomRunConfig,
  DEFAULT_BLOOM_GROW_FORM,
  updateBloomGrowFormFromMarkdown,
} from './outerBloomRunConfig';
import type { BloomGrowForm, BloomGrowthDirection, BloomGrowthMode } from './outerBloomRunConfig';

interface OuterBloomScreenProps {
  runClient: RunClient;
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly bloom: OuterBloomProjection };

type StageFilter = 'all' | 'case_study' | 'problem_recovery' | 'doppl' | 'selected';
type ScoreFilter = 'all' | 'scored' | 'unscored' | 'strong_judge' | 'selected';
type SortMode = 'lineage' | 'strongest' | 'selected';
type SidebarMode = 'browse' | 'grow';
type LaunchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'streaming'; readonly runId: string }
  | { readonly kind: 'error'; readonly message: string };
type BloomReplayState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'running';
      readonly token: number;
      readonly islandRunId: string;
      readonly visibleIds: ReadonlySet<string>;
      readonly processingIds: ReadonlySet<string>;
      readonly revealedAt: ReadonlyMap<string, number>;
      readonly revealParents: ReadonlyMap<string, string>;
    };

const DELETE_CONFIRM_CLICKS = 5;
const DELETE_CONFIRM_WINDOW_MS = 1800;

interface LayoutNode extends OuterBloomNode {
  x: number;
  y: number;
  radius: number;
  islandIndex: number;
}

interface LayoutEdge {
  id: string;
  source: LayoutNode;
  target: LayoutNode;
  type: string;
}

interface BloomBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface BloomPan {
  x: number;
  y: number;
}

interface BloomNodePosition {
  x: number;
  y: number;
}

interface BloomDragInfluence {
  id: string;
  start: BloomNodePosition;
  strength: number;
}

interface BloomDragState {
  pointerId: number;
  mode: 'pan' | 'node';
  nodeId?: string;
  startClientX: number;
  startClientY: number;
  startPan: BloomPan;
  startNode?: BloomNodePosition;
  influences?: BloomDragInfluence[];
  moved: boolean;
}

interface BloomNodeActivation {
  nodeId: string;
  runId: string;
}

const AGARDEN_RUN_CONTEXT_STORAGE_KEY = 'doppl.agarden.selectedRunId';
const AGARDEN_RUN_CONTEXT_EVENT = 'doppl:agarden-run-context';

const LIVE_BLOOM_REFRESH_MS = 2500;
const BLOOM_REPLAY_ROOT_DELAY_RANGE_MS = [4_000, 6_000] as const;
const BLOOM_REPLAY_SECOND_DELAY_RANGE_MS = [8_000, 10_000] as const;
const BLOOM_REPLAY_DEEP_DELAY_RANGE_MS = [10_000, 20_000] as const;
const WHEN_CRASHES_ROOT_ID = 'when-the-crashes-dont-come-575845a4';
const ROCK_STAR_ROOT_ID = 'jack-drone-privacy-fd080117';

const shell: CSSProperties = {
  minHeight: 'calc(100vh - 56px)',
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  color: 'var(--fg-default)',
  background:
    'radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 36%), var(--bg-base)',
};
const header: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 'var(--space-2)',
  alignItems: 'center',
  padding: '0.55rem var(--space-4)',
  borderBottom: 'thin solid var(--border-subtle)',
};
const title: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(1.15rem, 1.8vw, 1.55rem)',
  lineHeight: 1.05,
  letterSpacing: 0,
};
const titleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minHeight: 38,
  alignSelf: 'center',
};
const runReplayButton: CSSProperties = {
  minHeight: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'thin solid var(--accent)',
  borderRadius: '999px',
  background: 'color-mix(in srgb, var(--accent) 84%, var(--bg-surface))',
  color: 'var(--bg-base)',
  padding: '0 var(--space-3)',
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: 'var(--glow-active)',
  lineHeight: 1,
};
const statLabel: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const body: CSSProperties = {
  minHeight: 0,
  height: 'calc(100vh - 112px)',
  display: 'grid',
  gridTemplateColumns: '300px minmax(0, 1fr) 360px',
  gap: 'var(--space-3)',
  padding: 'var(--space-3)',
};
const panel: CSSProperties = {
  minHeight: 0,
  overflow: 'auto',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)',
};
const panelHeader: CSSProperties = {
  padding: 'var(--space-3)',
  borderBottom: 'thin solid var(--border-subtle)',
};
const panelTitle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};
const inspectorSectionTitle: CSSProperties = {
  ...panelTitle,
  color: 'var(--fg-default)',
  marginBottom: 'var(--space-2)',
};
const islandList: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-2)',
  padding: 'var(--space-3)',
};
const islandButton: CSSProperties = {
  width: '100%',
  textAlign: 'left',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-surface-2)',
  color: 'var(--fg-default)',
  padding: 'var(--space-3)',
  cursor: 'pointer',
};
const graphPanel: CSSProperties = {
  ...panel,
  position: 'relative',
  overflow: 'hidden',
};
const centerColumn: CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr) auto',
  gap: 'var(--space-3)',
};
const svgStyle: CSSProperties = { width: '100%', height: '100%', display: 'block' };
const inspectorBody: CSSProperties = {
  padding: 'var(--space-4)',
  display: 'grid',
  gap: 'var(--space-3)',
};
const badgeRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' };
const badge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '999px',
  border: 'thin solid var(--border-subtle)',
  padding: '0.2rem 0.55rem',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const inspectorInfoCard: CSSProperties = {
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
  background: 'var(--bg-surface-2)',
};
const inspectorList: CSSProperties = {
  margin: 0,
  paddingLeft: '1.15rem',
  color: 'var(--fg-muted)',
  lineHeight: 1.45,
  display: 'grid',
  gap: 'var(--space-1)',
};
const fieldLabel: CSSProperties = {
  display: 'block',
  marginBottom: 'var(--space-1)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};
const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: 38,
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-surface)',
  color: 'var(--fg-default)',
  padding: '0 var(--space-2)',
  font: 'inherit',
};

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 124,
  resize: 'vertical',
  padding: 'var(--space-2)',
  lineHeight: 1.45,
};

const sidebarTabs: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 'var(--space-2)',
  padding: 'var(--space-3)',
  borderBottom: 'thin solid var(--border-subtle)',
};

const compactBloomMeta: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
  color: 'var(--fg-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
};

const compactMetaStrong: CSSProperties = {
  color: 'var(--fg-default)',
  fontWeight: 800,
};

export function OuterBloomScreen({ runClient }: OuterBloomScreenProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('browse');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('lineage');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [launchState, setLaunchState] = useState<LaunchState>({ kind: 'idle' });
  const [liveEvents, setLiveEvents] = useState<RunEventEnvelope[]>([]);
  const [replayState, setReplayState] = useState<BloomReplayState>({ kind: 'idle' });
  const [showFullGraph, setShowFullGraph] = useState(false);
  const liveNodeCountsRef = useRef<Map<string, number>>(new Map());
  const replayTimersRef = useRef<number[]>([]);
  const replayTokenRef = useRef(0);

  useEffect(() => {
    let active = true;
    setState((current) => (current.kind === 'ready' ? current : { kind: 'loading' }));
    runClient
      .getOuterBloom()
      .then((bloom) => {
        if (!active) return;
        setState({ kind: 'ready', bloom });
        const defaultIsland = preferredDefaultIsland(bloom);
        setActiveRunId((current) =>
          current !== null && bloom.islands.some((island) => island.runId === current)
            ? current
            : (defaultIsland?.runId ?? null),
        );
        setSelectedId((current) => {
          if (
            current !== null &&
            bloom.islands.some((island) => island.nodes.some((node) => node.id === current))
          ) {
            return current;
          }
          return defaultIsland === null
            ? defaultBloomSelection(bloom)
            : defaultIslandSelection(defaultIsland);
        });
      })
      .catch(() => active && setState({ kind: 'error' }));
    return () => {
      active = false;
    };
  }, [runClient, reloadKey]);

  useEffect(() => {
    if (launchState.kind !== 'streaming') return;
    const baseUrl = resolveApiBaseUrl(import.meta.env);
    const stream: SseStream = createSseStream({
      url: `${baseUrl}/runs/${encodeURIComponent(launchState.runId)}/stream`,
      eventSourceFactory: (url): EventSourceLike => new EventSource(url),
      onEvent: (event) => {
        setLiveEvents((current) => [...current.slice(-11), event]);
        setReloadKey((key) => key + 1);
      },
    });
    return () => stream.close();
  }, [launchState]);

  useEffect(() => {
    if (launchState.kind !== 'streaming') return;
    const timer = window.setInterval(() => {
      setReloadKey((key) => key + 1);
    }, LIVE_BLOOM_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [launchState]);

  useEffect(() => {
    if (launchState.kind !== 'streaming' || state.kind !== 'ready') return;
    const island = state.bloom.islands.find((candidate) => candidate.runId === launchState.runId);
    if (island === undefined) return;

    const previousCount = liveNodeCountsRef.current.get(launchState.runId) ?? 0;
    const selectedIsInLiveRun = island.nodes.some((node) => node.id === selectedId);
    const newestNode = preferredLiveBloomNode(island);
    liveNodeCountsRef.current.set(launchState.runId, island.nodes.length);

    if (newestNode !== null && (!selectedIsInLiveRun || island.nodes.length > previousCount)) {
      setSelectedId(newestNode.id);
    }
  }, [launchState, selectedId, state]);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const allNodes = state.bloom.islands.flatMap((island) => island.nodes);
    const selected =
      allNodes.find((node) => node.id === selectedId) ?? state.bloom.islands[0]?.nodes[0] ?? null;
    if (selected !== null) publishAgardenRunContext(selected.runId);
  }, [selectedId, state]);

  const handleStarted = (run: StartRunResult) => {
    setLaunchState({ kind: 'streaming', runId: run.runId });
    setSidebarMode('browse');
    setLiveEvents([]);
    liveNodeCountsRef.current.delete(run.runId);
    setReloadKey((key) => key + 1);
  };

  const handleDeleteNode = async (node: OuterBloomNode) => {
    await runClient.deleteOuterBloomNode(node.id);
    setSelectedId(null);
    setReloadKey((key) => key + 1);
  };

  const clearReplayTimers = () => {
    for (const timer of replayTimersRef.current) window.clearTimeout(timer);
    replayTimersRef.current = [];
  };

  const stopBloomReplay = (nextShowFullGraph = true) => {
    clearReplayTimers();
    replayTokenRef.current += 1;
    setReplayState({ kind: 'idle' });
    setShowFullGraph(nextShowFullGraph);
  };

  const scheduleReplayNode = (
    island: OuterBloomIsland,
    nodeId: string,
    token: number,
    generation: number,
    delay = randomReplayDelayMs(generation),
  ) => {
    const timer = window.setTimeout(() => {
      const children = childrenForReplayNode(island, nodeId);
      const childrenWithChildren = children.filter(
        (child) => childrenForReplayNode(island, child.id).length > 0,
      );
      setReplayState((current) => {
        if (
          current.kind !== 'running' ||
          current.token !== token ||
          current.islandRunId !== island.runId ||
          !current.processingIds.has(nodeId)
        ) {
          return current;
        }

        const visibleIds = new Set(current.visibleIds);
        const processingIds = new Set(current.processingIds);
        const revealedAt = new Map(current.revealedAt);
        const revealParents = new Map(current.revealParents);
        processingIds.delete(nodeId);

        const now = window.performance.now();
        for (const child of children) {
          visibleIds.add(child.id);
          if (!revealedAt.has(child.id)) revealedAt.set(child.id, now);
          revealParents.set(child.id, nodeId);
        }
        for (const child of childrenWithChildren) {
          processingIds.add(child.id);
        }

        return {
          kind: 'running',
          token,
          islandRunId: island.runId,
          visibleIds,
          processingIds,
          revealedAt,
          revealParents,
        };
      });

      for (const child of childrenWithChildren) {
        scheduleReplayNode(island, child.id, token, generation + 1);
      }
    }, delay);

    replayTimersRef.current.push(timer);
  };

  const startBloomReplay = (bloom: OuterBloomProjection, preferredRunId: string | null) => {
    const island = replayIslandForBloom(bloom, preferredRunId);
    if (island === null) return;
    const root = replayRootForIsland(island);
    if (root === null) return;

    clearReplayTimers();
    setShowFullGraph(false);
    const token = replayTokenRef.current + 1;
    replayTokenRef.current = token;
    const hasChildren = childrenForReplayNode(island, root.id).length > 0;
    const processingIds = hasChildren ? new Set([root.id]) : new Set<string>();
    setSelectedId(root.id);
    setReplayState({
      kind: 'running',
      token,
      islandRunId: island.runId,
      visibleIds: new Set([root.id]),
      processingIds,
      revealedAt: new Map([[root.id, window.performance.now()]]),
      revealParents: new Map(),
    });
    if (hasChildren) scheduleReplayNode(island, root.id, token, 0);
  };

  useEffect(() => {
    return () => clearReplayTimers();
  }, []);

  useEffect(() => {
    if (replayState.kind !== 'running' || replayState.processingIds.size > 0) return;
    const timer = window.setTimeout(() => {
      setReplayState((current) =>
        current.kind === 'running' && current.token === replayState.token
          ? { kind: 'idle' }
          : current,
      );
      setShowFullGraph(true);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [replayState]);

  if (state.kind === 'loading') {
    return (
      <main style={{ padding: 'var(--space-5)' }}>
        <LoadingState shape="card" label="Loading Agarden..." />
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main style={{ padding: 'var(--space-5)' }}>
        <ErrorState
          title="Failed to load Agarden"
          detail="GET /bloom failed"
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </main>
    );
  }

  const liveRunId = launchState.kind === 'streaming' ? launchState.runId : null;
  const browseBloom = buildVisibleProjection(
    state.bloom.islands.filter((island) => isBrowsableAgardenIsland(island, liveRunId)),
  );
  const preferredIsland = preferredDefaultIsland(browseBloom);
  const activeIsland =
    browseBloom.islands.find((island) => island.runId === activeRunId) ?? preferredIsland;
  const activeBloom = buildVisibleProjection(activeIsland === null ? [] : [activeIsland]);
  const visibleBloom = filterBloom(activeBloom, stageFilter, scoreFilter, query);
  const seedOnlyBloom = activeIsland === null ? activeBloom : seedOnlyProjection(activeIsland);
  const allNodes = activeBloom.islands.flatMap((island) => island.nodes);
  const selected =
    allNodes.find((node) => node.id === selectedId) ??
    (activeIsland === null ? null : defaultSelectionNode(activeIsland));
  const selectedIsland = activeIsland?.nodes.some((node) => node.id === selected?.id)
    ? activeIsland
    : null;

  const handleActiveIslandChange = (runId: string) => {
    const island = browseBloom.islands.find((candidate) => candidate.runId === runId) ?? null;
    setActiveRunId(runId);
    setSelectedId(island === null ? null : defaultIslandSelection(island));
    stopBloomReplay(false);
  };

  return (
    <main aria-label="Agarden view" style={shell}>
      <header className="outer-bloom-header" style={header}>
        <div style={titleRow}>
          <h1 style={title}>Agarden</h1>
          <button
            type="button"
            style={runReplayButton}
            onClick={() =>
              replayState.kind === 'running'
                ? stopBloomReplay()
                : startBloomReplay(browseBloom, activeIsland?.runId ?? activeRunId)
            }
            title={
              replayState.kind === 'running'
                ? 'Stop the replay and show the full Agarden graph'
                : 'Replay how the current Agarden graph grows from the origin case study'
            }
          >
            {replayState.kind === 'running' ? 'Stop Run' : 'Run'}
          </button>
        </div>
        <div
          className="outer-bloom-compact-meta"
          style={compactBloomMeta}
          aria-label="Agarden totals"
        >
          <span>
            <span style={compactMetaStrong}>{browseBloom.totals.runs}</span> runs
          </span>
          <span>·</span>
          <span>
            <span style={compactMetaStrong}>{browseBloom.totals.problemRecoveries}</span> recoveries
          </span>
          <span>·</span>
          <span>
            <span style={compactMetaStrong}>{browseBloom.totals.doppls}</span> Doppls
          </span>
          <span>·</span>
          <span>
            <span style={compactMetaStrong}>{browseBloom.totals.selected}</span> selected
          </span>
        </div>
      </header>

      {browseBloom.islands.length === 0 ? (
        <section style={{ padding: 'var(--space-5)' }}>
          <EmptyState
            icon="◌"
            title="No Agarden artifacts yet"
            description="Start a run and this view will grow from the persisted event log."
          />
        </section>
      ) : (
        <section className="outer-bloom-body" style={body}>
          <aside style={panel} aria-label="Agarden control rail">
            <div style={sidebarTabs}>
              <SidebarTab
                active={sidebarMode === 'browse'}
                onClick={() => setSidebarMode('browse')}
              >
                Browse
              </SidebarTab>
              <SidebarTab active={sidebarMode === 'grow'} onClick={() => setSidebarMode('grow')}>
                Grow
              </SidebarTab>
            </div>
            {sidebarMode === 'browse' ? (
              <BloomLibrary
                bloom={browseBloom}
                visibleBloom={visibleBloom}
                selectedId={selected?.id ?? null}
                activeRunId={activeIsland?.runId ?? null}
                stageFilter={stageFilter}
                scoreFilter={scoreFilter}
                sortMode={sortMode}
                query={query}
                launchState={launchState}
                liveEvents={liveEvents}
                onActiveIslandChange={handleActiveIslandChange}
                onStageFilterChange={setStageFilter}
                onScoreFilterChange={setScoreFilter}
                onSortModeChange={setSortMode}
                onQueryChange={setQuery}
                onSelect={setSelectedId}
              />
            ) : (
              <BloomGrowPanel
                runClient={runClient}
                selectedIsland={selectedIsland}
                launchState={launchState}
                onLaunchState={setLaunchState}
                onStarted={handleStarted}
              />
            )}
          </aside>

          <div style={centerColumn}>
            <BloomGraph
              bloom={
                replayState.kind === 'running'
                  ? activeBloom
                  : showFullGraph
                    ? visibleBloom
                    : seedOnlyBloom
              }
              selectedId={selected?.id ?? null}
              replayState={replayState}
              onSelect={setSelectedId}
            />
            <ProofBoard island={selectedIsland} selected={selected} />
          </div>

          <Inspector node={selected} island={selectedIsland} onDeleteNode={handleDeleteNode} />
        </section>
      )}
    </main>
  );
}

function BloomLibrary({
  bloom,
  visibleBloom,
  selectedId,
  activeRunId,
  stageFilter,
  scoreFilter,
  sortMode,
  query,
  launchState,
  liveEvents,
  onActiveIslandChange,
  onStageFilterChange,
  onScoreFilterChange,
  onSortModeChange,
  onQueryChange,
  onSelect,
}: {
  bloom: OuterBloomProjection;
  visibleBloom: OuterBloomProjection;
  selectedId: string | null;
  activeRunId: string | null;
  stageFilter: StageFilter;
  scoreFilter: ScoreFilter;
  sortMode: SortMode;
  query: string;
  launchState: LaunchState;
  liveEvents: readonly RunEventEnvelope[];
  onActiveIslandChange: (runId: string) => void;
  onStageFilterChange: (filter: StageFilter) => void;
  onScoreFilterChange: (filter: ScoreFilter) => void;
  onSortModeChange: (mode: SortMode) => void;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
}) {
  const visibleCount = visibleBloom.islands.reduce(
    (count, island) => count + island.nodes.length,
    0,
  );
  return (
    <div aria-label="Agarden library">
      <div style={panelHeader}>
        <h2 style={panelTitle}>Library</h2>
        <p
          style={{
            margin: 'var(--space-2) 0 0',
            color: 'var(--fg-muted)',
            fontSize: 'var(--text-body-sm)',
          }}
        >
          {visibleCount} of {bloom.totals.nodes} outer artifacts visible
        </p>
      </div>
      <div style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-3)' }}>
        <label>
          <span style={fieldLabel}>Case study</span>
          <select
            value={activeRunId ?? ''}
            onChange={(event) => onActiveIslandChange(event.target.value)}
            style={inputStyle}
          >
            {bloom.islands.map((island) => (
              <option key={island.runId} value={island.runId}>
                {islandTitle(island)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={fieldLabel}>Search</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Title or summary"
            style={inputStyle}
          />
        </label>
        <div>
          <span style={fieldLabel}>Stage</span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 'var(--space-2)',
            }}
          >
            {stageFilterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onStageFilterChange(option.value)}
                style={filterPillStyle(stageFilter === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span style={fieldLabel}>Signal</span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 'var(--space-2)',
            }}
          >
            {scoreFilterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onScoreFilterChange(option.value)}
                style={filterPillStyle(scoreFilter === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span style={fieldLabel}>Sort</span>
          <select
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value as SortMode)}
            style={inputStyle}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <LiveRunSummary launchState={launchState} liveEvents={liveEvents} />
      </div>
      <div style={islandList}>
        {visibleBloom.islands.map((island) => {
          const caseStudy =
            island.nodes.find((node) => node.parentId === null) ??
            island.nodes.find((node) => node.stage === 'case_study') ??
            island.nodes[0];
          const listedNodes = sortLibraryNodes(
            island.nodes.filter((node) => node.stage !== 'case_study'),
            sortMode,
          );
          return (
            <div key={island.runId} style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <button
                type="button"
                style={{
                  ...islandButton,
                  borderColor: island.nodes.some((node) => node.id === selectedId)
                    ? 'var(--accent)'
                    : 'var(--border-subtle)',
                }}
                onClick={() => onSelect(caseStudy?.id ?? island.nodes[0]?.id ?? island.runId)}
              >
                <strong>{caseStudy?.label ?? island.runId}</strong>
                <span style={{ display: 'block', color: 'var(--fg-muted)', marginTop: 4 }}>
                  {countStage(island, 'problem_recovery')} problem recoveries ·{' '}
                  {countStage(island, 'doppl')} Doppls
                </span>
              </button>
              {listedNodes.slice(0, 8).map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onSelect(node.id)}
                  style={{
                    textAlign: 'left',
                    border: 'thin solid',
                    borderColor: node.id === selectedId ? 'var(--accent)' : 'transparent',
                    borderRadius: 'var(--radius-sm)',
                    background: node.id === selectedId ? 'var(--bg-surface-2)' : 'transparent',
                    color: 'var(--fg-default)',
                    padding: 'var(--space-2)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ ...fieldLabel, marginBottom: 2, color: colorForBloomNode(node) }}>
                    {labelForStage(node.stage)}
                  </span>
                  <span style={{ display: 'block', fontSize: 'var(--text-body-sm)' }}>
                    {truncate(node.label, 42)}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SidebarTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'thin solid',
        borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
        borderRadius: '999px',
        background: active ? 'var(--accent)' : 'var(--bg-surface-2)',
        color: active ? 'var(--bg-base)' : 'var(--fg-muted)',
        padding: '0.55rem 0.7rem',
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function BloomGrowPanel({
  runClient,
  selectedIsland,
  launchState,
  onLaunchState,
  onStarted,
}: {
  runClient: RunClient;
  selectedIsland: OuterBloomIsland | null;
  launchState: LaunchState;
  onLaunchState: (state: LaunchState) => void;
  onStarted: (run: StartRunResult) => void;
}) {
  const [form, setForm] = useState<BloomGrowForm>(() => bloomGrowFormFromIsland(selectedIsland));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formIsRunnable = canBuildBloomRunConfig(form);

  const update = <Key extends keyof BloomGrowForm>(key: Key, value: BloomGrowForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    const text = await file.text();
    setForm((current) => updateBloomGrowFormFromMarkdown(current, text, file.name));
  };

  const submit = () => {
    if (busy || !formIsRunnable) return;
    const result = buildBloomRunConfig(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onLaunchState({ kind: 'starting' });
    runClient
      .startOuterCampaign(
        {
          title: form.title,
          synopsis: form.synopsis,
          seedText: form.seedText,
          generationMode: form.generationMode,
          direction: form.direction,
          runConfig: result.config,
        },
        { idempotencyKey: `outer-campaign-${crypto.randomUUID()}` },
      )
      .then((campaign) => {
        const runId = campaign.activeRunIds[0];
        if (runId === undefined) {
          throw new Error('Campaign started without an active inner run.');
        }
        onStarted({ runId });
      })
      .catch((error: unknown) => {
        onLaunchState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Failed to start Agarden campaign.',
        });
      });
  };

  const busy = launchState.kind === 'starting';

  return (
    <div aria-label="Grow Agarden" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div style={panelHeader}>
        <h2 style={panelTitle}>Grow</h2>
        <p
          style={{
            margin: 'var(--space-2) 0 0',
            color: 'var(--fg-muted)',
            fontSize: 'var(--text-body-sm)',
          }}
        >
          Start a kernel run and watch Agarden update from the event log.
        </p>
      </div>
      <div style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-3)' }}>
        <label>
          <span style={fieldLabel}>Case study file</span>
          <input
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            onChange={handleFile}
          />
        </label>
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {selectedIsland !== null && (
            <Button
              variant="secondary"
              glyph="↺"
              onClick={() => {
                setErrors({});
                setForm(bloomGrowFormFromIsland(selectedIsland));
              }}
            >
              Fill from selected map node
            </Button>
          )}
          <Button
            variant="primary"
            glyph="▶"
            onClick={submit}
            disabled={busy || !formIsRunnable}
            aria-disabled={busy || !formIsRunnable}
            title={
              formIsRunnable
                ? 'Start a kernel run from this Agarden seed'
                : 'Add a title and seed material before starting an Agarden run'
            }
          >
            {busy ? 'Starting Agarden...' : 'Run Agarden'}
          </Button>
          {!formIsRunnable && (
            <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-caption)' }}>
              Add a title and seed material to enable Run Agarden.
            </span>
          )}
        </div>
        <label>
          <span style={fieldLabel}>Title</span>
          <input
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="When The Crashes Don't Come"
            style={inputStyle}
            aria-invalid={errors.title !== undefined}
          />
          {errors.title !== undefined && <FieldError>{errors.title}</FieldError>}
        </label>
        <label>
          <span style={fieldLabel}>Synopsis</span>
          <input
            value={form.synopsis}
            onChange={(event) => update('synopsis', event.target.value)}
            placeholder="One-line case summary"
            style={inputStyle}
          />
        </label>
        <label>
          <span style={fieldLabel}>Seed material</span>
          <textarea
            value={form.seedText}
            onChange={(event) => update('seedText', event.target.value)}
            placeholder="Paste the case study, observation, contradiction, or markdown source..."
            style={textAreaStyle}
            aria-invalid={errors.seedText !== undefined}
          />
          {errors.seedText !== undefined && <FieldError>{errors.seedText}</FieldError>}
        </label>
        <SegmentedControl
          label="Mode"
          value={form.generationMode}
          options={[
            ['recover_problem', 'Recover'],
            ['grow_doppl', 'Doppl'],
            ['campaign', 'Campaign'],
          ]}
          onChange={(value) => update('generationMode', value)}
        />
        <SegmentedControl
          label="Dial"
          value={form.direction}
          options={[
            ['auto', 'Auto'],
            ['converge', 'Converge'],
            ['diverge', 'Diverge'],
          ]}
          onChange={(value) => update('direction', value)}
        />
        <div>
          <span style={fieldLabel}>Operators</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {generationOperatorOptions.map((operator) => {
              const active = form.operators.includes(operator);
              return (
                <button
                  key={operator}
                  type="button"
                  onClick={() =>
                    update(
                      'operators',
                      active
                        ? form.operators.filter((value) => value !== operator)
                        : [...form.operators, operator],
                    )
                  }
                  style={filterPillStyle(active)}
                >
                  {operator.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 'var(--space-2)',
          }}
        >
          <NumberField
            label="Population"
            value={form.generateCount}
            onChange={(value) => update('generateCount', value)}
          />
          <NumberField
            label="Spawn depth"
            value={form.maxSpawnDepth}
            onChange={(value) => update('maxSpawnDepth', value)}
          />
          <NumberField
            label="Depth"
            value={form.maxGenerations}
            onChange={(value) => update('maxGenerations', value)}
          />
          <NumberField
            label="Energy"
            value={form.energyBudget}
            onChange={(value) => update('energyBudget', value)}
          />
          <NumberField
            label="Tool calls"
            value={form.maxToolCalls}
            onChange={(value) => update('maxToolCalls', value)}
          />
        </div>
        {launchState.kind === 'error' && <FieldError>{launchState.message}</FieldError>}
      </div>
    </div>
  );
}

function SegmentedControl<Value extends BloomGrowthMode | BloomGrowthDirection>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly (readonly [Value, string])[];
  onChange: (value: Value) => void;
}) {
  return (
    <div>
      <span style={fieldLabel}>{label}</span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
          gap: 'var(--space-2)',
        }}
      >
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            style={filterPillStyle(value === optionValue)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span style={fieldLabel}>{label}</span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={inputStyle}
      />
    </label>
  );
}

function FieldError({ children }: { children: string }) {
  return (
    <span style={{ color: 'var(--danger)', fontSize: 'var(--text-caption)', fontWeight: 700 }}>
      {children}
    </span>
  );
}

function LiveRunSummary({
  launchState,
  liveEvents,
}: {
  launchState: LaunchState;
  liveEvents: readonly RunEventEnvelope[];
}) {
  if (launchState.kind === 'idle') return null;
  const latest = liveEvents[liveEvents.length - 1];
  return (
    <div
      style={{
        border: 'thin solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-3)',
        background: 'var(--bg-surface-2)',
      }}
    >
      <span style={fieldLabel}>Live Agarden</span>
      <strong style={{ display: 'block' }}>
        {launchState.kind === 'starting'
          ? 'Starting run'
          : launchState.kind === 'streaming'
            ? truncate(launchState.runId, 28)
            : 'Launch failed'}
      </strong>
      <span style={{ display: 'block', color: 'var(--fg-muted)', marginTop: 'var(--space-1)' }}>
        {latest === undefined ? 'Waiting for events...' : `${latest.type} · #${latest.sequence}`}
      </span>
    </div>
  );
}

function bloomGrowFormFromIsland(island: OuterBloomIsland | null): BloomGrowForm {
  const caseStudy =
    island?.nodes.find((node) => node.parentId === null) ??
    island?.nodes.find((node) => node.stage === 'case_study') ??
    null;
  if (caseStudy === null) return DEFAULT_BLOOM_GROW_FORM;
  return {
    ...DEFAULT_BLOOM_GROW_FORM,
    title: caseStudy.label,
    synopsis: caseStudy.summary,
    seedText: uniqueNonEmpty([caseStudy.summary, island?.seed]).join('\n\n'),
  };
}

function uniqueNonEmpty(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed === undefined || trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function replayIslandForBloom(
  bloom: OuterBloomProjection,
  preferredRunId: string | null,
): OuterBloomIsland | null {
  if (preferredRunId !== null) {
    const preferred = bloom.islands.find((island) => island.runId === preferredRunId);
    if (preferred !== undefined) return preferred;
  }
  const defaultIsland = preferredDefaultIsland(bloom);
  if (defaultIsland !== null) return defaultIsland;
  return (
    bloom.islands.find((island) =>
      island.nodes.some(
        (node) =>
          node.id === WHEN_CRASHES_ROOT_ID ||
          node.label.toLowerCase() === "when the crashes don't come",
      ),
    ) ??
    bloom.islands[0] ??
    null
  );
}

function replayRootForIsland(island: OuterBloomIsland): OuterBloomNode | null {
  return (
    island.nodes.find(
      (node) => node.id === ROCK_STAR_ROOT_ID || node.id === WHEN_CRASHES_ROOT_ID,
    ) ??
    island.nodes.find((node) => node.parentId === null) ??
    island.nodes.find((node) => node.stage === 'case_study') ??
    island.nodes[0] ??
    null
  );
}

function childrenForReplayNode(
  island: OuterBloomIsland,
  parentId: string,
): readonly OuterBloomNode[] {
  return island.nodes.filter((node) => node.parentId === parentId).sort(compareOuterBloomNodes);
}

function randomReplayDelayMs(generation: number): number {
  const [min, max] =
    generation === 0
      ? BLOOM_REPLAY_ROOT_DELAY_RANGE_MS
      : generation === 1
        ? BLOOM_REPLAY_SECOND_DELAY_RANGE_MS
        : BLOOM_REPLAY_DEEP_DELAY_RANGE_MS;
  return min + Math.round(Math.random() * (max - min));
}

function BloomGraph({
  bloom,
  selectedId,
  replayState,
  onSelect,
}: {
  bloom: OuterBloomProjection;
  selectedId: string | null;
  replayState: BloomReplayState;
  onSelect: (id: string) => void;
}) {
  const [nodeOverrides, setNodeOverrides] = useState<Record<string, BloomNodePosition>>({});
  const layout = useMemo(() => layoutBloom(bloom, nodeOverrides), [bloom, nodeOverrides]);
  const replayVisibleIds = replayState.kind === 'running' ? replayState.visibleIds : null;
  const replayProcessingIds =
    replayState.kind === 'running' ? replayState.processingIds : new Set<string>();
  const replayRevealedAt =
    replayState.kind === 'running' ? replayState.revealedAt : new Map<string, number>();
  const replayRevealParents =
    replayState.kind === 'running' ? replayState.revealParents : new Map<string, string>();
  const renderedNodes =
    replayVisibleIds === null
      ? layout.nodes
      : layout.nodes.filter((node) => replayVisibleIds.has(node.id));
  const renderedEdges =
    replayVisibleIds === null
      ? layout.edges
      : layout.edges.filter(
          (edge) => replayVisibleIds.has(edge.source.id) && replayVisibleIds.has(edge.target.id),
        );
  const selected = layout.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedPath = selected === null ? new Set<string>() : ancestrySet(selected, layout.nodes);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<BloomPan>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<BloomDragState | null>(null);
  const suppressNodeClickRef = useRef(false);
  const cameraAnimationRef = useRef<number | null>(null);
  const visibleBounds = scaledBounds(layout.bounds, zoom, pan);
  const viewBox = `${visibleBounds.minX} ${visibleBounds.minY} ${visibleBounds.width} ${visibleBounds.height}`;

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [layout.bounds.minX, layout.bounds.minY, layout.bounds.width, layout.bounds.height]);

  useEffect(() => {
    const liveIds = new Set(bloom.islands.flatMap((island) => island.nodes.map((node) => node.id)));
    setNodeOverrides((current) => {
      const next: Record<string, BloomNodePosition> = {};
      for (const [id, position] of Object.entries(current)) {
        if (liveIds.has(id)) next[id] = position;
      }
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [bloom]);

  useEffect(() => {
    return () => {
      if (cameraAnimationRef.current !== null) {
        window.cancelAnimationFrame(cameraAnimationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (replayState.kind !== 'running') return;
    const root =
      layout.nodes.find((node) => node.parentId === null) ??
      layout.nodes.find((node) => node.stage === 'case_study') ??
      layout.nodes[0] ??
      null;
    if (root === null) return;

    if (cameraAnimationRef.current !== null) {
      window.cancelAnimationFrame(cameraAnimationRef.current);
      cameraAnimationRef.current = null;
    }

    const centerX = layout.bounds.minX + layout.bounds.width / 2;
    const centerY = layout.bounds.minY + layout.bounds.height / 2;
    const startZoom = 2.12;
    const startPan = { x: root.x - centerX, y: root.y - centerY };
    const endZoom = 1;
    const endPan = { x: 0, y: 0 };
    const durationMs = 1500;
    let startedAt: number | null = null;

    setZoom(startZoom);
    setPan(startPan);

    const tick = (now: number) => {
      if (startedAt === null) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setZoom(Number((startZoom + (endZoom - startZoom) * eased).toFixed(3)));
      setPan({
        x: startPan.x + (endPan.x - startPan.x) * eased,
        y: startPan.y + (endPan.y - startPan.y) * eased,
      });
      if (progress < 1) {
        cameraAnimationRef.current = window.requestAnimationFrame(tick);
      } else {
        cameraAnimationRef.current = null;
      }
    };

    cameraAnimationRef.current = window.requestAnimationFrame(tick);
  }, [replayState.kind === 'running' ? replayState.token : null, layout.bounds, layout.nodes]);

  const zoomBy = (delta: number) => {
    setZoom((current) => clampZoom(current + delta));
  };
  const zoomAt = (clientX: number, clientY: number, delta: number) => {
    const svg = svgRef.current;
    if (svg === null) {
      zoomBy(delta);
      return;
    }
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      zoomBy(delta);
      return;
    }

    setZoom((currentZoom) => {
      const nextZoom = clampZoom(currentZoom + delta);
      if (nextZoom === currentZoom) return currentZoom;

      const currentBounds = scaledBounds(layout.bounds, currentZoom, pan);
      const xRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const yRatio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      const cursorWorldX = currentBounds.minX + currentBounds.width * xRatio;
      const cursorWorldY = currentBounds.minY + currentBounds.height * yRatio;
      const nextWidth = layout.bounds.width / nextZoom;
      const nextHeight = layout.bounds.height / nextZoom;
      const layoutCenterX = layout.bounds.minX + layout.bounds.width / 2;
      const layoutCenterY = layout.bounds.minY + layout.bounds.height / 2;
      const nextCenterX = cursorWorldX - (xRatio - 0.5) * nextWidth;
      const nextCenterY = cursorWorldY - (yRatio - 0.5) * nextHeight;

      setPan({
        x: nextCenterX - layoutCenterX,
        y: nextCenterY - layoutCenterY,
      });
      return nextZoom;
    });
  };
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const wheelScale = event.deltaMode === 1 ? 0.18 : 0.0024;
    const delta = Math.max(-0.34, Math.min(0.34, -event.deltaY * wheelScale));
    zoomAt(event.clientX, event.clientY, delta);
  };
  const nodeActivationAt = (clientX: number, clientY: number): BloomNodeActivation | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const nodeElement = element?.closest<SVGGElement>('[data-bloom-node-id]');
    if (nodeElement === undefined || nodeElement === null || !svgRef.current?.contains(nodeElement))
      return null;
    const { bloomNodeId, bloomRunId } = nodeElement.dataset;
    if (bloomNodeId === undefined || bloomRunId === undefined) return null;
    return { nodeId: bloomNodeId, runId: bloomRunId };
  };
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const activation = nodeActivationAt(event.clientX, event.clientY);
    const dragNode =
      activation === null
        ? null
        : (layout.nodes.find((node) => node.id === activation.nodeId) ?? null);
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextDragState: BloomDragState = {
      pointerId: event.pointerId,
      mode: dragNode === null ? 'pan' : 'node',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPan: pan,
      moved: false,
    };
    if (dragNode !== null) {
      nextDragState.nodeId = dragNode.id;
      nextDragState.startNode = { x: dragNode.x, y: dragNode.y };
      nextDragState.influences = dragInfluencesForNode(layout, dragNode.id);
      onSelect(dragNode.id);
    }
    dragStateRef.current = nextDragState;
    setIsDragging(true);
  };
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragStateRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const svg = svgRef.current;
    if (svg === null) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      drag.moved = true;
      suppressNodeClickRef.current = true;
    }

    if (drag.mode === 'node' && drag.nodeId !== undefined && drag.startNode !== undefined) {
      const worldDx = (dx / rect.width) * visibleBounds.width;
      const worldDy = (dy / rect.height) * visibleBounds.height;
      setNodeOverrides((current) => ({
        ...current,
        ...dragInfluenceOverrides(drag.influences ?? [], worldDx, worldDy),
      }));
      return;
    }

    setPan({
      x: drag.startPan.x - (dx / rect.width) * visibleBounds.width,
      y: drag.startPan.y - (dy / rect.height) * visibleBounds.height,
    });
  };
  const finishDrag = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragStateRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      window.setTimeout(() => {
        suppressNodeClickRef.current = false;
      }, 80);
      return;
    }

    const activation = nodeActivationAt(event.clientX, event.clientY);
    if (activation === null) return;
    onSelect(activation.nodeId);
  };
  const fitBloom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const focusSelected = () => {
    if (selected === null) return;
    const centerX = layout.bounds.minX + layout.bounds.width / 2;
    const centerY = layout.bounds.minY + layout.bounds.height / 2;
    setZoom((current) => Math.max(current, 1.72));
    setPan({ x: selected.x - centerX, y: selected.y - centerY });
  };

  return (
    <section className="outer-bloom-graph-panel" style={graphPanel} aria-label="Agarden graph">
      <svg
        ref={svgRef}
        className="outer-bloom-svg"
        viewBox={viewBox}
        role="img"
        aria-label="Agarden map of runs"
        style={{ ...svgStyle, cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={() => {
          dragStateRef.current = null;
          setIsDragging(false);
        }}
      >
        <defs>
          <radialGradient id="bloom-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.36" />
            <stop offset="70%" stopColor="var(--accent)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <filter id="bloom-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect
          x={layout.bounds.minX}
          y={layout.bounds.minY}
          width={layout.bounds.width}
          height={layout.bounds.height}
          fill="transparent"
        />

        {renderedEdges.map((edge) => {
          const isPathEdge = selectedPath.has(edge.source.id) && selectedPath.has(edge.target.id);
          return (
            <path
              key={edge.id}
              d={edgePath(edge)}
              fill="none"
              stroke={isPathEdge ? 'var(--accent)' : edgeStroke(edge)}
              strokeWidth={isPathEdge ? 3.2 : edge.type === 'recovered' ? 1.8 : 1.15}
              strokeOpacity={selected === null ? 0.46 : isPathEdge ? 0.9 : 0.28}
              strokeDasharray={edge.type === 'descended' ? '7 7' : undefined}
              strokeLinecap="round"
            />
          );
        })}

        {renderedNodes.map((node) => {
          const isSelected = node.id === selected?.id;
          const isPathNode = selectedPath.has(node.id);
          const isDimmed = selected !== null && !isPathNode;
          const fill = colorForBloomNode(node);
          const label = labelPlacement(node);
          const showLabel = node.stage !== 'doppl' || isSelected || layout.nodes.length <= 3;
          const haloOpacity = haloOpacityForNode(node, isSelected, isPathNode);
          const isProcessing = replayProcessingIds.has(node.id);
          const revealedAt = replayRevealedAt.get(node.id);
          const revealParentId = replayRevealParents.get(node.id);
          const revealParent =
            revealParentId === undefined
              ? null
              : (layout.nodes.find((candidate) => candidate.id === revealParentId) ?? null);
          const revealStyle =
            replayState.kind === 'running' && revealedAt !== undefined && revealParent !== null
              ? ({
                  cursor: isDragging ? 'grabbing' : 'pointer',
                  animation: 'doppl-map-spring-out 760ms var(--ease-out) both',
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                  '--doppl-map-from-x': `${revealParent.x - node.x}px`,
                  '--doppl-map-from-y': `${revealParent.y - node.y}px`,
                } as CSSProperties)
              : ({ cursor: isDragging ? 'grabbing' : 'pointer' } as CSSProperties);
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              data-bloom-node-id={node.id}
              data-bloom-run-id={node.runId}
              aria-label={node.label}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(node.id);
                if (event.key === 'Enter' && event.metaKey) openInnerRun(node.runId);
              }}
              style={revealStyle}
              opacity={isDimmed ? 0.84 : 1}
              data-replay-processing={isProcessing ? 'true' : undefined}
            >
              {isProcessing && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius * 3.8}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.2"
                  strokeOpacity="0.72"
                  style={{
                    animation: 'doppl-map-pulse 1.6s var(--ease-in-out) infinite',
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                  }}
                />
              )}
              <circle
                cx={node.x}
                cy={node.y}
                r={node.radius * (3.1 + haloOpacity)}
                fill="url(#bloom-halo)"
                opacity={haloOpacity}
              />
              {node.novelty !== null && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius + 5 + Math.max(0, Math.min(6, node.novelty * 6))}
                  fill="none"
                  stroke="color-mix(in srgb, var(--accent) 70%, white)"
                  strokeOpacity={0.26 + Math.min(0.42, node.novelty * 0.42)}
                  strokeWidth="1.6"
                />
              )}
              <circle
                cx={node.x}
                cy={node.y}
                r={node.radius}
                fill={fill}
                filter={isSelected ? 'url(#bloom-glow)' : undefined}
                style={{
                  animation:
                    replayState.kind === 'running' &&
                    revealedAt !== undefined &&
                    revealParent === null
                      ? 'doppl-map-pop 420ms var(--ease-out)'
                      : undefined,
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
                stroke={
                  isSelected ? 'var(--fg-default)' : 'color-mix(in srgb, white 42%, transparent)'
                }
                strokeWidth={isSelected ? 3 : 1.2}
              />
              {node.status === 'selected' && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius * 0.42}
                  fill="var(--fg-default)"
                  opacity="0.86"
                />
              )}
              {showLabel && (
                <text
                  x={node.x + label.dx}
                  y={node.y + label.dy}
                  textAnchor={label.anchor}
                  fill={isSelected ? 'var(--fg-default)' : 'var(--fg-muted)'}
                  fontFamily="var(--font-mono)"
                  fontSize={isSelected || node.stage !== 'doppl' ? 12 : 11}
                  fontWeight={isSelected ? 700 : 500}
                >
                  {truncate(node.label, isSelected ? 44 : label.max)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          right: 'var(--space-3)',
          top: 'var(--space-3)',
          display: 'grid',
          gap: 'var(--space-2)',
          justifyItems: 'end',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-1)',
            padding: 'var(--space-1)',
            border: 'thin solid var(--border-subtle)',
            borderRadius: '999px',
            background: 'color-mix(in srgb, var(--bg-surface) 86%, transparent)',
          }}
          aria-label="Agarden zoom controls"
        >
          <GraphControl label="Zoom out" onClick={() => zoomBy(-0.2)}>
            -
          </GraphControl>
          <GraphControl label="Reset graph view" onClick={fitBloom}>
            Fit
          </GraphControl>
          <GraphControl label="Zoom in" onClick={() => zoomBy(0.2)}>
            +
          </GraphControl>
          <GraphControl
            label="Focus selected artifact"
            disabled={selected === null}
            onClick={focusSelected}
          >
            Focus
          </GraphControl>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 'var(--space-3)',
          bottom: 'var(--space-3)',
          display: 'flex',
          gap: 'var(--space-3)',
          padding: 'var(--space-2) var(--space-3)',
          border: 'thin solid var(--border-subtle)',
          borderRadius: '999px',
          background: 'color-mix(in srgb, var(--bg-surface) 82%, transparent)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-caption)',
          color: 'var(--fg-muted)',
        }}
      >
        <span>case study</span>
        <span style={{ color: 'var(--subtype-zeitgeist)' }}>problem recovery</span>
        <span style={{ color: 'var(--accent)' }}>doppl</span>
        <span style={{ color: 'var(--success)' }}>selected</span>
        <span>drag nodes to arrange</span>
      </div>
    </section>
  );
}

function GraphControl({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        minWidth: children.length > 1 ? 48 : 30,
        height: 30,
        border: 'thin solid var(--border-subtle)',
        borderRadius: '999px',
        background: disabled ? 'transparent' : 'var(--bg-surface-2)',
        color: disabled ? 'var(--fg-faint)' : 'var(--fg-default)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-caption)',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

function dragInfluencesForNode(
  layout: ReturnType<typeof layoutBloom>,
  nodeId: string,
): BloomDragInfluence[] {
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Set<string>>();
  for (const node of layout.nodes) adjacency.set(node.id, new Set());
  for (const edge of layout.edges) {
    adjacency.get(edge.source.id)?.add(edge.target.id);
    adjacency.get(edge.target.id)?.add(edge.source.id);
  }

  const influences = new Map<string, number>([[nodeId, 1]]);
  const direct = adjacency.get(nodeId) ?? new Set<string>();
  for (const id of direct) influences.set(id, Math.max(influences.get(id) ?? 0, 0.34));
  for (const id of direct) {
    for (const secondHop of adjacency.get(id) ?? []) {
      if (secondHop === nodeId) continue;
      influences.set(secondHop, Math.max(influences.get(secondHop) ?? 0, 0.13));
    }
  }

  return [...influences.entries()]
    .map(([id, strength]) => {
      const node = nodeById.get(id);
      if (node === undefined) return null;
      return { id, strength, start: { x: node.x, y: node.y } };
    })
    .filter((influence): influence is BloomDragInfluence => influence !== null);
}

function dragInfluenceOverrides(
  influences: readonly BloomDragInfluence[],
  dx: number,
  dy: number,
): Record<string, BloomNodePosition> {
  const overrides: Record<string, BloomNodePosition> = {};
  for (const influence of influences) {
    overrides[influence.id] = {
      x: influence.start.x + dx * influence.strength,
      y: influence.start.y + dy * influence.strength,
    };
  }
  return overrides;
}

function ProofBoard({
  island,
  selected,
}: {
  island: OuterBloomIsland | null;
  selected: OuterBloomNode | null;
}) {
  const nodes = island?.nodes ?? [];
  const selectedCount = nodes.filter(
    (node) => node.stage === 'doppl' && node.status === 'selected',
  ).length;
  const rejectedCount = nodes.filter((node) =>
    ['rejected', 'culled', 'invalid'].includes(node.status),
  ).length;
  const scoredCount = nodes.filter(
    (node) => node.score !== null || node.judgeAcceptance !== null,
  ).length;
  const sequenceThrough = island?.sequenceThrough ?? 0;
  return (
    <section style={panel} aria-label="Agarden proof board">
      <div
        className="outer-bloom-proof-content"
        style={{
          padding: 'var(--space-3)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) repeat(5, auto)',
          gap: 'var(--space-3)',
          alignItems: 'center',
        }}
      >
        <div>
          <h2 style={panelTitle}>Proof Board</h2>
          <p
            style={{
              margin: 'var(--space-1) 0 0',
              color: 'var(--fg-muted)',
              fontSize: 'var(--text-body-sm)',
            }}
          >
            {selected === null
              ? 'Select an artifact to inspect its local Agarden evidence.'
              : `${labelForStage(selected.stage)} selected from ${island?.status ?? 'unknown'} island`}
          </p>
        </div>
        <MiniStat label="nodes" value={nodes.length} />
        <MiniStat label="scored" value={scoredCount} />
        <MiniStat label="selected" value={selectedCount} />
        <MiniStat label="pruned" value={rejectedCount} />
        <MiniStat label="seq" value={sequenceThrough} />
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ minWidth: 68, textAlign: 'right' }}>
      <strong style={{ display: 'block', fontSize: 'var(--text-h4)' }}>{value}</strong>
      <span style={{ ...statLabel, color: 'var(--fg-muted)' }}>{label}</span>
    </div>
  );
}

function Inspector({
  node,
  island,
  onDeleteNode,
}: {
  node: OuterBloomNode | null;
  island: OuterBloomIsland | null;
  onDeleteNode: (node: OuterBloomNode) => Promise<void>;
}) {
  const children = island?.nodes.filter((childNode) => childNode.parentId === node?.id) ?? [];
  const lineage = node === null || island === null ? [] : lineageForNode(node, island.nodes);
  const parentLineage = lineage.slice(0, -1);
  const artifactSections =
    node === null ? emptyArtifactSections() : parseArtifactSections(node.body);
  const skinQuestions =
    node === null ? [] : skinQuestionsForNode(node, artifactSections.skinInTheGame);
  const dopplHighlights =
    node?.stage === 'doppl'
      ? [
          { label: 'Implications', items: artifactSections.implications },
          { label: 'Opportunities', items: artifactSections.opportunities },
        ].filter((section) => section.items.length > 0)
      : [];
  return (
    <aside style={panel} aria-label="Agarden inspector">
      <div style={panelHeader}>
        <h2 style={panelTitle}>Inspector</h2>
      </div>
      {node === null ? (
        <div style={inspectorBody}>
          <p style={{ color: 'var(--fg-muted)' }}>Select an Agarden node to inspect it.</p>
        </div>
      ) : (
        <div style={inspectorBody}>
          <div style={badgeRow}>
            <span style={badge}>{labelForStage(node.stage)}</span>
            <span style={badge}>{node.status}</span>
            {node.generationIndex !== null && <span style={badge}>gen {node.generationIndex}</span>}
            {children.length > 0 && <span style={badge}>{children.length} children</span>}
          </div>
          <h2 style={{ margin: 0, fontSize: 'var(--text-h3)', lineHeight: 1.15 }}>{node.label}</h2>
          <p style={{ margin: 0, color: 'var(--fg-muted)', lineHeight: 1.55 }}>{node.summary}</p>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <Metric label="fitness" value={formatScore(node.score)} />
            <Metric label="novelty" value={formatScore(node.novelty)} />
            <Metric label="judge" value={formatScore(node.judgeAcceptance)} />
            <Metric label="children" value={String(children.length)} />
          </div>
          {parentLineage.map((lineageNode) => (
            <InspectorSection key={lineageNode.id} title={titleForStage(lineageNode.stage)}>
              <p style={{ margin: 0, color: 'var(--fg-muted)', lineHeight: 1.45 }}>
                {lineageNode.label}
              </p>
            </InspectorSection>
          ))}
          {skinQuestions.length > 0 && (
            <InspectorSection title="Skin in the Game">
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {skinQuestions.map((item) => (
                  <div key={item.party} style={inspectorInfoCard}>
                    <strong style={{ display: 'block', color: 'var(--fg-default)' }}>
                      {item.party}
                    </strong>
                    <span
                      style={{
                        display: 'block',
                        color: 'var(--fg-muted)',
                        lineHeight: 1.45,
                        marginTop: 'var(--space-1)',
                      }}
                    >
                      "{item.question}"
                    </span>
                  </div>
                ))}
              </div>
            </InspectorSection>
          )}
          {dopplHighlights.map((section) => (
            <InspectorSection key={section.label} title={section.label}>
              <ul style={inspectorList}>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </InspectorSection>
          ))}
          {children.length > 0 && (
            <div
              style={{ borderTop: 'thin solid var(--border-subtle)', paddingTop: 'var(--space-3)' }}
            >
              <h3 style={inspectorSectionTitle}>Children</h3>
              <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                {children.slice(0, 5).map((child) => (
                  <div
                    key={child.id}
                    style={{
                      border: 'thin solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 'var(--space-2)',
                      background: 'var(--bg-surface-2)',
                    }}
                  >
                    <strong style={{ display: 'block' }}>{truncate(child.label, 44)}</strong>
                    <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-body-sm)' }}>
                      {labelForStage(child.stage)} · {child.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {node.sourceId !== null && (
            <Button variant="secondary" glyph="↗" onClick={() => openInnerRun(node.runId)}>
              Open inner run
            </Button>
          )}
          <DeleteBloomNodeButton node={node} onDeleteNode={onDeleteNode} />
        </div>
      )}
    </aside>
  );
}

function DeleteBloomNodeButton({
  node,
  onDeleteNode,
}: {
  node: OuterBloomNode;
  onDeleteNode: (node: OuterBloomNode) => Promise<void>;
}) {
  const [clicks, setClicks] = useState(0);
  const [lastClickAt, setLastClickAt] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setClicks(0);
    setLastClickAt(0);
    setStatus(null);
    setPending(false);
  }, [node.id]);

  useEffect(() => {
    if (clicks === 0 || pending) return;
    const timeout = window.setTimeout(() => {
      setClicks(0);
      setLastClickAt(0);
    }, DELETE_CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timeout);
  }, [clicks, pending]);

  const handleClick = async () => {
    if (pending) return;
    const now = Date.now();
    const nextClicks =
      lastClickAt > 0 && now - lastClickAt <= DELETE_CONFIRM_WINDOW_MS ? clicks + 1 : 1;
    setClicks(nextClicks);
    setLastClickAt(now);
    setStatus(null);

    if (nextClicks < DELETE_CONFIRM_CLICKS) return;

    setPending(true);
    try {
      await onDeleteNode(node);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not delete this node.');
      setPending(false);
      setClicks(0);
      setLastClickAt(0);
    }
  };

  const progress = Math.min(clicks / DELETE_CONFIRM_CLICKS, 1);
  const label =
    clicks === 0
      ? 'Delete node'
      : clicks < DELETE_CONFIRM_CLICKS
        ? `Delete node ${clicks}/${DELETE_CONFIRM_CLICKS}`
        : 'Deleting...';

  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <Button
        variant="secondary"
        size="sm"
        glyph="x"
        disabled={pending}
        onClick={handleClick}
        aria-label={`Delete ${node.label} and descendants after ${DELETE_CONFIRM_CLICKS} quick clicks`}
        style={{
          color: progress > 0 ? 'var(--danger)' : 'var(--fg-muted)',
          border: `thin solid rgba(255, 92, 92, ${0.35 + progress * 0.55})`,
          background: `rgba(255, 92, 92, ${0.04 + progress * 0.18})`,
        }}
      >
        {label}
      </Button>
      <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-caption)', lineHeight: 1.35 }}>
        {pending
          ? 'Deleting selected subtree...'
          : clicks > 0
            ? 'Keep clicking quickly to confirm.'
            : 'Testing only: removes imported artifacts or hides live projection subtrees.'}
      </span>
      {status !== null && (
        <span style={{ color: 'var(--danger)', fontSize: 'var(--text-caption)', lineHeight: 1.35 }}>
          {status}
        </span>
      )}
    </div>
  );
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ borderTop: 'thin solid var(--border-subtle)', paddingTop: 'var(--space-3)' }}>
      <h3 style={inspectorSectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        borderTop: 'thin solid var(--border-subtle)',
        paddingTop: 'var(--space-2)',
      }}
    >
      <span style={{ color: 'var(--fg-muted)' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function layoutBloom(
  bloom: OuterBloomProjection,
  nodeOverrides: Record<string, BloomNodePosition> = {},
) {
  const islandCount = Math.max(1, bloom.islands.length);
  const islandRadius = islandCount === 1 ? 0 : Math.max(560, islandCount * 154);
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  bloom.islands.forEach((island, islandIndex) => {
    const islandAngle = (Math.PI * 2 * islandIndex) / islandCount - Math.PI / 2;
    const center = {
      x: Math.cos(islandAngle) * islandRadius,
      y: Math.sin(islandAngle) * islandRadius,
    };
    const placed = new Map<string, LayoutNode>();
    const childrenByParent = childrenIndex(island);

    const explicitRoots = island.nodes.filter((node) => node.parentId === null);
    const rootNodes = explicitRoots.length > 0 ? explicitRoots : island.nodes.slice(0, 1);

    rootNodes.forEach((node, rootIndex) => {
      const rootOffset = {
        x: rootNodes.length === 1 ? 0 : Math.cos((Math.PI * 2 * rootIndex) / rootNodes.length) * 82,
        y: rootNodes.length === 1 ? 0 : Math.sin((Math.PI * 2 * rootIndex) / rootNodes.length) * 82,
      };
      const layoutNode = {
        ...node,
        x: center.x + rootOffset.x,
        y: center.y + rootOffset.y,
        radius: 15,
        islandIndex,
      };
      nodes.push(layoutNode);
      placed.set(node.id, layoutNode);
      placeChildren({
        root: layoutNode,
        parent: layoutNode,
        childrenByParent,
        placed,
        nodes,
        islandIndex,
        startAngle: -Math.PI,
        endAngle: Math.PI,
        depth: 1,
      });
    });

    for (const edge of island.edges) {
      const source = placed.get(edge.source);
      const target = placed.get(edge.target);
      if (source !== undefined && target !== undefined) {
        edges.push({ ...edge, source, target });
      }
    }
  });

  relaxBloomLayout(nodes, edges);
  for (const node of nodes) {
    const override = nodeOverrides[node.id];
    if (override !== undefined) {
      node.x = override.x;
      node.y = override.y;
    }
  }

  const bounds = boundsFor(nodes);
  return { nodes, edges, bounds };
}

function childrenIndex(island: OuterBloomIsland): Map<string, OuterBloomNode[]> {
  const children = new Map<string, OuterBloomNode[]>();
  for (const node of island.nodes) {
    if (node.parentId === null) continue;
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  }
  return children;
}

function placeChildren({
  root,
  parent,
  childrenByParent,
  placed,
  nodes,
  islandIndex,
  startAngle,
  endAngle,
  depth,
}: {
  root: LayoutNode;
  parent: LayoutNode;
  childrenByParent: Map<string, OuterBloomNode[]>;
  placed: Map<string, LayoutNode>;
  nodes: LayoutNode[];
  islandIndex: number;
  startAngle: number;
  endAngle: number;
  depth: number;
}) {
  const children = [...(childrenByParent.get(parent.id) ?? [])].sort(compareOuterBloomNodes);
  if (children.length === 0) return;

  const sector = endAngle - startAngle;
  const weights = children.map((child) => subtreeWeight(child, childrenByParent));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const distance =
    parent.stage === 'case_study'
      ? 218 + Math.min(56, children.length * 8)
      : parent.stage === 'problem_recovery'
        ? 178
        : 136 + Math.min(52, depth * 10);

  let cursor = startAngle;
  children.forEach((child, index) => {
    if (placed.has(child.id)) return;
    const childSector = (sector * (weights[index] ?? 1)) / totalWeight;
    const rawAngle = cursor + childSector / 2;
    cursor += childSector;
    const angle = normalizeAngle(rawAngle + deterministicWobble(child.id, 0.045));
    const radialJitter = deterministicWobble(`${child.id}:radius`, 24);
    const parentPull = parent.stage === 'case_study' ? root : parent;
    const anchorDistance =
      parent.stage === 'case_study' ? distance + radialJitter : distance + radialJitter * 0.55;
    const layoutNode = {
      ...child,
      x:
        parentPull.x + Math.cos(angle) * (anchorDistance + depth * 42) + (parent.x - root.x) * 0.18,
      y:
        parentPull.y + Math.sin(angle) * (anchorDistance + depth * 42) + (parent.y - root.y) * 0.18,
      radius: radiusForNode(child),
      islandIndex,
    };
    nodes.push(layoutNode);
    placed.set(child.id, layoutNode);
    placeChildren({
      root,
      parent: layoutNode,
      childrenByParent,
      placed,
      nodes,
      islandIndex,
      startAngle: rawAngle - childSector / 2,
      endAngle: rawAngle + childSector / 2,
      depth: depth + 1,
    });
  });
}

function relaxBloomLayout(nodes: LayoutNode[], edges: LayoutEdge[]) {
  if (nodes.length < 2) return;
  const anchors = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const velocities = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]));
  const iterations = Math.min(150, 70 + nodes.length * 2);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const alpha = 1 - iteration / iterations;
    for (let index = 0; index < nodes.length; index += 1) {
      const a = nodes[index];
      if (a === undefined) continue;
      const va = velocities.get(a.id)!;
      const anchor = anchors.get(a.id)!;
      va.x += (anchor.x - a.x) * 0.008 * alpha;
      va.y += (anchor.y - a.y) * 0.008 * alpha;

      for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
        const b = nodes[otherIndex];
        if (b === undefined) continue;
        const vb = velocities.get(b.id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.001) {
          dx = deterministicWobble(`${a.id}:${b.id}:x`, 1) || 0.5;
          dy = deterministicWobble(`${a.id}:${b.id}:y`, 1) || -0.5;
          distance = Math.hypot(dx, dy);
        }
        const minDistance =
          a.radius +
          b.radius +
          (a.islandIndex === b.islandIndex ? 72 : 118) +
          (a.stage === 'case_study' || b.stage === 'case_study' ? 26 : 0);
        if (distance >= minDistance) continue;
        const push = ((minDistance - distance) / minDistance) * 5.8 * alpha;
        const ux = dx / distance;
        const uy = dy / distance;
        va.x += ux * push;
        va.y += uy * push;
        vb.x -= ux * push;
        vb.y -= uy * push;
      }
    }

    for (const edge of edges) {
      const source = byId.get(edge.source.id);
      const target = byId.get(edge.target.id);
      if (source === undefined || target === undefined) continue;
      const sourceVelocity = velocities.get(source.id)!;
      const targetVelocity = velocities.get(target.id)!;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.hypot(dx, dy) || 1;
      const desired =
        source.stage === 'case_study' ? 238 : source.stage === 'problem_recovery' ? 184 : 156;
      const spring = ((distance - desired) / distance) * 0.026 * alpha;
      const fx = dx * spring;
      const fy = dy * spring;
      sourceVelocity.x += fx;
      sourceVelocity.y += fy;
      targetVelocity.x -= fx;
      targetVelocity.y -= fy;
    }

    for (const node of nodes) {
      const velocity = velocities.get(node.id)!;
      node.x += velocity.x;
      node.y += velocity.y;
      velocity.x *= 0.72;
      velocity.y *= 0.72;
    }
  }
}

function subtreeWeight(
  node: OuterBloomNode,
  childrenByParent: Map<string, OuterBloomNode[]>,
): number {
  const children = childrenByParent.get(node.id) ?? [];
  if (children.length === 0) return 1;
  return 1 + children.reduce((sum, child) => sum + subtreeWeight(child, childrenByParent), 0);
}

function compareOuterBloomNodes(a: OuterBloomNode, b: OuterBloomNode): number {
  if (a.stage !== b.stage) return stageOrder(a.stage) - stageOrder(b.stage);
  if (a.generationIndex !== b.generationIndex) {
    return (
      (a.generationIndex ?? Number.MAX_SAFE_INTEGER) -
      (b.generationIndex ?? Number.MAX_SAFE_INTEGER)
    );
  }
  return a.id.localeCompare(b.id);
}

function stageOrder(stage: OuterBloomNode['stage']): number {
  if (stage === 'case_study') return 0;
  if (stage === 'problem_recovery') return 1;
  return 2;
}

function normalizeAngle(angle: number): number {
  let current = angle;
  while (current <= -Math.PI) current += Math.PI * 2;
  while (current > Math.PI) current -= Math.PI * 2;
  return current;
}

function boundsFor(nodes: readonly LayoutNode[]) {
  if (nodes.length === 0) return { minX: -400, minY: -300, width: 800, height: 600 };
  const pad = 112;
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function deterministicWobble(seed: string, amplitude: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return ((Math.abs(hash) % 1000) / 500 - 1) * amplitude;
}

function edgePath(edge: LayoutEdge): string {
  const dx = edge.target.x - edge.source.x;
  const dy = edge.target.y - edge.source.y;
  const distance = Math.hypot(dx, dy) || 1;
  const bend = edge.type === 'recovered' ? 0.08 : edge.type === 'solved_by' ? 0.24 : 0.18;
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const direction = edge.source.islandIndex % 2 === 0 ? 1 : -1;
  const curve = Math.min(72, distance * bend) * direction;
  const c1x = edge.source.x + dx * 0.42 + normalX * curve;
  const c1y = edge.source.y + dy * 0.42 + normalY * curve;
  const c2x = edge.source.x + dx * 0.72 + normalX * curve;
  const c2y = edge.source.y + dy * 0.72 + normalY * curve;
  return `M ${edge.source.x} ${edge.source.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${edge.target.x} ${edge.target.y}`;
}

function edgeStroke(edge: LayoutEdge): string {
  if (edge.type === 'recovered')
    return 'color-mix(in srgb, var(--subtype-zeitgeist) 58%, var(--fg-faint))';
  if (edge.type === 'solved_by') return 'color-mix(in srgb, var(--accent) 52%, var(--fg-faint))';
  return 'var(--fg-faint)';
}

function scaledBounds(bounds: BloomBounds, zoom: number, pan: BloomPan): BloomBounds {
  const width = bounds.width / zoom;
  const height = bounds.height / zoom;
  const centerX = bounds.minX + bounds.width / 2 + pan.x;
  const centerY = bounds.minY + bounds.height / 2 + pan.y;
  return {
    minX: centerX - width / 2,
    minY: centerY - height / 2,
    width,
    height,
  };
}

function clampZoom(value: number): number {
  return Math.max(0.62, Math.min(2.8, Number(value.toFixed(2))));
}

function openInnerRun(runId: string): void {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  window.location.assign(`${base}runs/${encodeURIComponent(runId)}`);
}

function publishAgardenRunContext(runId: string): void {
  try {
    window.localStorage.setItem(AGARDEN_RUN_CONTEXT_STORAGE_KEY, runId);
  } catch {
    // Navigation still works from the inspector button; the shell menu just will not persist.
  }
  window.dispatchEvent(new CustomEvent(AGARDEN_RUN_CONTEXT_EVENT, { detail: { runId } }));
}

function radiusForNode(node: OuterBloomNode): number {
  const score = node.score ?? node.judgeAcceptance ?? 0.3;
  const scaled = Math.max(0, Math.min(1, score > 1 ? score / 5 : score));
  return 8 + scaled * 9 + (node.status === 'selected' ? 4 : 0);
}

function colorForBloomNode(node: OuterBloomNode): string {
  if (node.stage === 'case_study') return 'var(--fg-muted)';
  if (node.stage === 'problem_recovery') return 'var(--subtype-zeitgeist)';
  if (node.status === 'selected') return 'var(--success)';
  if (node.status === 'rejected' || node.status === 'culled' || node.status === 'invalid') {
    return 'var(--danger)';
  }
  return 'var(--accent)';
}

function labelForStage(stage: OuterBloomNode['stage']): string {
  if (stage === 'case_study') return 'case study';
  if (stage === 'problem_recovery') return 'problem recovery';
  return 'doppl';
}

function titleForStage(stage: OuterBloomNode['stage']): string {
  if (stage === 'case_study') return 'Case Study';
  if (stage === 'problem_recovery') return 'Problem Recovery';
  return 'Doppl';
}

function labelPlacement(node: LayoutNode): {
  dx: number;
  dy: number;
  anchor: 'start' | 'middle';
  max: number;
} {
  if (node.stage === 'case_study')
    return { dx: 0, dy: -node.radius - 14, anchor: 'middle', max: 32 };
  if (node.stage === 'problem_recovery')
    return { dx: 0, dy: node.radius + 24, anchor: 'middle', max: 34 };
  return { dx: 0, dy: node.radius + 22, anchor: 'middle', max: 28 };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function formatScore(value: number | null): string {
  if (value === null) return 'not scored';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function preferredDefaultIsland(bloom: OuterBloomProjection): OuterBloomIsland | null {
  return (
    bloom.islands.find((island) => islandContainsRoot(island, ROCK_STAR_ROOT_ID)) ??
    bloom.islands.find((island) => islandContainsRoot(island, WHEN_CRASHES_ROOT_ID)) ??
    bloom.islands[0] ??
    null
  );
}

function islandContainsRoot(island: OuterBloomIsland, rootId: string): boolean {
  return island.runId === rootId || island.nodes.some((node) => node.id === rootId);
}

function islandRoot(island: OuterBloomIsland): OuterBloomNode | null {
  return (
    island.nodes.find((node) => node.parentId === null) ??
    island.nodes.find((node) => node.stage === 'case_study') ??
    island.nodes[0] ??
    null
  );
}

function islandTitle(island: OuterBloomIsland): string {
  return islandRoot(island)?.label ?? island.runId;
}

function isBrowsableAgardenIsland(island: OuterBloomIsland, liveRunId: string | null): boolean {
  if (liveRunId !== null && island.runId === liveRunId) return true;
  return (
    islandContainsRoot(island, ROCK_STAR_ROOT_ID) ||
    islandContainsRoot(island, WHEN_CRASHES_ROOT_ID)
  );
}

function defaultSelectionNode(island: OuterBloomIsland): OuterBloomNode | null {
  return islandRoot(island);
}

function defaultIslandSelection(island: OuterBloomIsland): string | null {
  return defaultSelectionNode(island)?.id ?? null;
}

function defaultBloomSelection(bloom: OuterBloomProjection): string | null {
  const island = preferredDefaultIsland(bloom);
  return island === null ? null : defaultIslandSelection(island);
}

function seedOnlyProjection(island: OuterBloomIsland): OuterBloomProjection {
  const root = replayRootForIsland(island) ?? islandRoot(island);
  const nodes = root === null ? [] : [root];
  return buildVisibleProjection([{ ...island, nodes, edges: [] }]);
}

function preferredLiveBloomNode(island: OuterBloomIsland): OuterBloomNode | null {
  return (
    lastOf(island.nodes.filter((node) => node.stage === 'doppl' && node.status === 'selected')) ??
    lastOf(island.nodes.filter((node) => node.stage === 'doppl')) ??
    lastOf(island.nodes.filter((node) => node.stage === 'problem_recovery')) ??
    lastOf(island.nodes.filter((node) => node.stage === 'case_study')) ??
    island.nodes[island.nodes.length - 1] ??
    null
  );
}

function lastOf<T>(values: readonly T[]): T | null {
  return values.length === 0 ? null : values[values.length - 1]!;
}

interface ArtifactSections {
  skinInTheGame: readonly string[];
  implications: readonly string[];
  opportunities: readonly string[];
}

function emptyArtifactSections(): ArtifactSections {
  return { skinInTheGame: [], implications: [], opportunities: [] };
}

function parseArtifactSections(body: string | undefined): ArtifactSections {
  if (body === undefined || body.trim().length === 0) return emptyArtifactSections();
  return {
    skinInTheGame: markdownSectionItems(body, 'Skin in the Game'),
    implications: markdownSectionItems(body, 'Implications'),
    opportunities: markdownSectionItems(body, 'Opportunities'),
  };
}

function markdownSectionItems(body: string, heading: string): string[] {
  const raw = markdownSectionText(body, heading);
  if (raw === null) return [];
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const listItems = lines
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => cleanMarkdownInline(line.replace(/^[-*]\s+/, '')));
  if (listItems.length > 0) return uniqueNonEmpty(listItems);

  const compact = cleanMarkdownInline(raw);
  const headingPrefix = new RegExp(`^${escapeRegExp(heading)}\\s*[-:]\\s*`, 'i');
  return uniqueNonEmpty(
    compact
      .replace(headingPrefix, '')
      .split(/\s+-\s+/)
      .map((item) => item.trim()),
  );
}

function markdownSectionText(body: string, heading: string): string | null {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const match = /^(#{2,6})\s+(.+?)\s*$/.exec(line.trim());
    return normalizeHeading(match?.[2] ?? '') === normalizeHeading(heading);
  });
  if (start === -1) return null;

  const collected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{2,6}\s+/.test(line.trim())) break;
    collected.push(line);
  }
  const result = collected.join('\n').trim();
  return result.length > 0 ? result : null;
}

function skinQuestionsForNode(
  node: OuterBloomNode,
  parties: readonly string[],
): readonly { party: string; question: string }[] {
  return parties
    .map((party) => {
      const question = skinValidationQuestion(node.id, party);
      return question === null ? null : { party, question };
    })
    .filter((item): item is { party: string; question: string } => item !== null);
}

function normalizeHeading(value: string): string {
  return value.trim().toLowerCase().replace(/[—–-]/g, '-').replace(/\s+/g, ' ');
}

function cleanMarkdownInline(value: string): string {
  return value
    .replace(/\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const stageFilterOptions: readonly { value: StageFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'case_study', label: 'Cases' },
  { value: 'problem_recovery', label: 'Problems' },
  { value: 'doppl', label: 'Doppls' },
  { value: 'selected', label: 'Selected' },
];

const scoreFilterOptions: readonly { value: ScoreFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scored', label: 'Scored' },
  { value: 'unscored', label: 'Unscored' },
  { value: 'strong_judge', label: 'Strong judge' },
  { value: 'selected', label: 'Selected' },
];

const sortOptions: readonly { value: SortMode; label: string }[] = [
  { value: 'lineage', label: 'Lineage order' },
  { value: 'strongest', label: 'Strongest first' },
  { value: 'selected', label: 'Selected first' },
];

const generationOperatorOptions = [
  'breakthrough',
  'first_principles',
  'polymath',
  'breakout',
  'blindside',
  'subtraction',
  'constraint',
] as const;

function filterBloom(
  bloom: OuterBloomProjection,
  stageFilter: StageFilter,
  scoreFilter: ScoreFilter,
  query: string,
): OuterBloomProjection {
  const normalizedQuery = query.trim().toLowerCase();
  const islands = bloom.islands
    .map((island) => {
      const matched = island.nodes.filter((node) => {
        const stageMatches =
          stageFilter === 'all' ||
          node.stage === stageFilter ||
          (stageFilter === 'selected' && node.stage === 'doppl' && node.status === 'selected');
        const scoreMatches = scoreFilterMatches(node, scoreFilter);
        const textMatches =
          normalizedQuery.length === 0 ||
          `${node.label} ${node.summary} ${island.seed}`.toLowerCase().includes(normalizedQuery);
        return stageMatches && scoreMatches && textMatches;
      });
      if (matched.length === 0) return null;

      const keepIds = new Set<string>();
      for (const node of matched) {
        keepIds.add(node.id);
        let parentId = node.parentId;
        while (parentId !== null) {
          const parent = island.nodes.find((parentNode) => parentNode.id === parentId);
          if (parent === undefined) break;
          keepIds.add(parent.id);
          parentId = parent.parentId;
        }
      }

      const nodes = island.nodes.filter((node) => keepIds.has(node.id));
      const edges = island.edges.filter(
        (edge) => keepIds.has(edge.source) && keepIds.has(edge.target),
      );
      return { ...island, nodes, edges };
    })
    .filter((island): island is OuterBloomIsland => island !== null);

  return buildVisibleProjection(islands);
}

function scoreFilterMatches(node: OuterBloomNode, filter: ScoreFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'selected') return node.stage === 'doppl' && node.status === 'selected';
  const score = normalizedNodeStrength(node);
  if (filter === 'scored') return score !== null;
  if (filter === 'unscored') return score === null;
  return score !== null && score >= 0.7;
}

function sortLibraryNodes(nodes: readonly OuterBloomNode[], sortMode: SortMode): OuterBloomNode[] {
  const sorted = [...nodes];
  if (sortMode === 'strongest') {
    return sorted.sort(
      (a, b) => (normalizedNodeStrength(b) ?? -1) - (normalizedNodeStrength(a) ?? -1),
    );
  }
  if (sortMode === 'selected') {
    return sorted.sort((a, b) => Number(b.status === 'selected') - Number(a.status === 'selected'));
  }
  return sorted;
}

function normalizedNodeStrength(node: OuterBloomNode): number | null {
  const value = node.score ?? node.judgeAcceptance;
  if (value === null) return null;
  return Math.max(0, Math.min(1, value > 1 ? value / 5 : value));
}

function filterPillStyle(active: boolean): CSSProperties {
  return {
    border: 'thin solid',
    borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
    borderRadius: '999px',
    background: active
      ? 'color-mix(in srgb, var(--accent) 24%, var(--bg-surface))'
      : 'var(--bg-surface-2)',
    color: active ? 'var(--fg-default)' : 'var(--fg-muted)',
    padding: '0.42rem 0.65rem',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-caption)',
    cursor: 'pointer',
  };
}

function buildVisibleProjection(islands: readonly OuterBloomIsland[]): OuterBloomProjection {
  const doppls = islands.reduce(
    (count, island) => count + island.nodes.filter((node) => node.stage === 'doppl').length,
    0,
  );
  const problemRecoveries = islands.reduce(
    (count, island) =>
      count + island.nodes.filter((node) => node.stage === 'problem_recovery').length,
    0,
  );
  const selected = islands.reduce(
    (count, island) =>
      count +
      island.nodes.filter((node) => node.stage === 'doppl' && node.status === 'selected').length,
    0,
  );
  return {
    islands: [...islands],
    totals: {
      runs: islands.length,
      nodes: islands.reduce((count, island) => count + island.nodes.length, 0),
      problemRecoveries,
      doppls,
      selected,
    },
  };
}

function countStage(island: OuterBloomIsland, stage: OuterBloomNode['stage']): number {
  return island.nodes.filter((node) => node.stage === stage).length;
}

function ancestrySet(selected: LayoutNode, nodes: readonly LayoutNode[]): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ids = new Set<string>();
  let cursor: LayoutNode | undefined = selected;
  while (cursor !== undefined) {
    ids.add(cursor.id);
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
  }
  return ids;
}

function lineageForNode(
  selected: OuterBloomNode,
  nodes: readonly OuterBloomNode[],
): OuterBloomNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lineage: OuterBloomNode[] = [];
  let cursor: OuterBloomNode | undefined = selected;
  while (cursor !== undefined) {
    lineage.push(cursor);
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
  }
  return lineage.reverse();
}

function haloOpacityForNode(
  node: OuterBloomNode,
  isSelected: boolean,
  isPathNode: boolean,
): number {
  if (isSelected) return 0.98;
  if (isPathNode) return 0.62;
  const score = node.score ?? node.judgeAcceptance ?? 0;
  const scaled = Math.max(0, Math.min(1, score > 1 ? score / 5 : score));
  return 0.2 + scaled * 0.34;
}
