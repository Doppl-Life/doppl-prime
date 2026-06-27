import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, PointerEvent, WheelEvent } from 'react';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ds';
import type { RunClient } from '../data/runClient';
import type { StartRunResult } from '../data/runClient';
import type { OuterBloomIsland, OuterBloomNode, OuterBloomProjection } from '../data/outerBloom';
import { resolveApiBaseUrl } from '../data/apiBase';
import { createSseStream } from '../data/sseStream';
import type { RunEventEnvelope } from '../data/contracts';
import type { EventSourceLike, SseStream } from '../data/sseStream';
import {
  buildBloomRunConfig,
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

interface BloomDragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPan: BloomPan;
  moved: boolean;
}

interface BloomNodeActivation {
  nodeId: string;
  runId: string;
  timestamp: number;
}

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
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('browse');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('lineage');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [launchState, setLaunchState] = useState<LaunchState>({ kind: 'idle' });
  const [liveEvents, setLiveEvents] = useState<RunEventEnvelope[]>([]);

  useEffect(() => {
    let active = true;
    setState((current) => (current.kind === 'ready' ? current : { kind: 'loading' }));
    runClient
      .getOuterBloom()
      .then((bloom) => {
        if (!active) return;
        setState({ kind: 'ready', bloom });
        setSelectedId((current) => current ?? defaultBloomSelection(bloom));
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

  const handleStarted = (run: StartRunResult) => {
    setLaunchState({ kind: 'streaming', runId: run.runId });
    setSidebarMode('browse');
    setLiveEvents([]);
    setReloadKey((key) => key + 1);
  };

  if (state.kind === 'loading') {
    return (
      <main style={{ padding: 'var(--space-5)' }}>
        <LoadingState shape="card" label="Loading bloom…" />
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main style={{ padding: 'var(--space-5)' }}>
        <ErrorState
          title="Failed to load outer bloom"
          detail="GET /bloom failed"
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </main>
    );
  }

  const visibleBloom = filterBloom(state.bloom, stageFilter, scoreFilter, query);
  const allNodes = state.bloom.islands.flatMap((island) => island.nodes);
  const selected =
    allNodes.find((node) => node.id === selectedId) ??
    state.bloom.islands[0]?.nodes[0] ??
    null;
  const selectedIsland =
    state.bloom.islands.find((island) => island.nodes.some((node) => node.id === selected?.id)) ??
    null;

  return (
    <main aria-label="Outer bloom view" style={shell}>
      <header className="outer-bloom-header" style={header}>
        <div>
          <h1 style={title}>Bloom Map</h1>
        </div>
        <div className="outer-bloom-compact-meta" style={compactBloomMeta} aria-label="Bloom totals">
          <span>
            <span style={compactMetaStrong}>{state.bloom.totals.runs}</span> runs
          </span>
          <span>·</span>
          <span>
            <span style={compactMetaStrong}>{state.bloom.totals.problemRecoveries}</span> recoveries
          </span>
          <span>·</span>
          <span>
            <span style={compactMetaStrong}>{state.bloom.totals.doppls}</span> Doppls
          </span>
          <span>·</span>
          <span>
            <span style={compactMetaStrong}>{state.bloom.totals.selected}</span> selected
          </span>
        </div>
      </header>

      {state.bloom.islands.length === 0 ? (
        <section style={{ padding: 'var(--space-5)' }}>
          <EmptyState
            icon="◌"
            title="No bloom islands yet"
            description="Start a run and this view will flower from the persisted event log."
          />
        </section>
      ) : (
        <section className="outer-bloom-body" style={body}>
          <aside style={panel} aria-label="Bloom control rail">
            <div style={sidebarTabs}>
              <SidebarTab active={sidebarMode === 'browse'} onClick={() => setSidebarMode('browse')}>
                Browse
              </SidebarTab>
              <SidebarTab active={sidebarMode === 'grow'} onClick={() => setSidebarMode('grow')}>
                Grow
              </SidebarTab>
            </div>
            {sidebarMode === 'browse' ? (
              <BloomLibrary
                bloom={state.bloom}
                visibleBloom={visibleBloom}
                selectedId={selected?.id ?? null}
                stageFilter={stageFilter}
                scoreFilter={scoreFilter}
                sortMode={sortMode}
                query={query}
                launchState={launchState}
                liveEvents={liveEvents}
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
              bloom={visibleBloom}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />
            <ProofBoard island={selectedIsland} selected={selected} />
          </div>

          <Inspector node={selected} island={selectedIsland} />
        </section>
      )}
    </main>
  );
}

function BloomLibrary({
  bloom,
  visibleBloom,
  selectedId,
  stageFilter,
  scoreFilter,
  sortMode,
  query,
  launchState,
  liveEvents,
  onStageFilterChange,
  onScoreFilterChange,
  onSortModeChange,
  onQueryChange,
  onSelect,
}: {
  bloom: OuterBloomProjection;
  visibleBloom: OuterBloomProjection;
  selectedId: string | null;
  stageFilter: StageFilter;
  scoreFilter: ScoreFilter;
  sortMode: SortMode;
  query: string;
  launchState: LaunchState;
  liveEvents: readonly RunEventEnvelope[];
  onStageFilterChange: (filter: StageFilter) => void;
  onScoreFilterChange: (filter: ScoreFilter) => void;
  onSortModeChange: (mode: SortMode) => void;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
}) {
  const visibleCount = visibleBloom.islands.reduce((count, island) => count + island.nodes.length, 0);
  return (
    <div aria-label="Bloom library">
      <div style={panelHeader}>
        <h2 style={panelTitle}>Library</h2>
        <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--fg-muted)', fontSize: 'var(--text-body-sm)' }}>
          {visibleCount} of {bloom.totals.nodes} outer artifacts visible
        </p>
      </div>
      <div style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-3)' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
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
                  borderColor:
                    island.nodes.some((node) => node.id === selectedId)
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
              {listedNodes
                .slice(0, 8)
                .map((node) => (
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
    const result = buildBloomRunConfig(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onLaunchState({ kind: 'starting' });
    runClient
      .startRun(result.config, { idempotencyKey: `outer-bloom-${crypto.randomUUID()}` })
      .then(onStarted)
      .catch((error: unknown) => {
        onLaunchState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Failed to start bloom run.',
        });
      });
  };

  const busy = launchState.kind === 'starting';

  return (
    <div aria-label="Grow bloom" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div style={panelHeader}>
        <h2 style={panelTitle}>Grow</h2>
        <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--fg-muted)', fontSize: 'var(--text-body-sm)' }}>
          Start a kernel run and watch the bloom update from the event log.
        </p>
      </div>
      <div style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-3)' }}>
        <label>
          <span style={fieldLabel}>Case study file</span>
          <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={handleFile} />
        </label>
        {selectedIsland !== null && (
          <Button variant="secondary" glyph="↺" onClick={() => setForm(bloomGrowFormFromIsland(selectedIsland))}>
            Use selected bloom
          </Button>
        )}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
          <NumberField label="Population" value={form.generateCount} onChange={(value) => update('generateCount', value)} />
          <NumberField
            label="Spawn depth"
            value={form.maxSpawnDepth}
            onChange={(value) => update('maxSpawnDepth', value)}
          />
          <NumberField label="Depth" value={form.maxGenerations} onChange={(value) => update('maxGenerations', value)} />
          <NumberField label="Energy" value={form.energyBudget} onChange={(value) => update('energyBudget', value)} />
          <NumberField label="Tool calls" value={form.maxToolCalls} onChange={(value) => update('maxToolCalls', value)} />
        </div>
        {launchState.kind === 'error' && <FieldError>{launchState.message}</FieldError>}
        <Button variant="primary" glyph="▶" onClick={submit} disabled={busy}>
          {busy ? 'Starting bloom...' : 'Run bloom'}
        </Button>
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
    <span style={{ color: 'var(--danger)', fontSize: 'var(--text-caption)', fontWeight: 700 }}>{children}</span>
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
      <span style={fieldLabel}>Live bloom</span>
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

function BloomGraph({
  bloom,
  selectedId,
  onSelect,
}: {
  bloom: OuterBloomProjection;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const layout = useMemo(() => layoutBloom(bloom), [bloom]);
  const selected = layout.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedPath = selected === null ? new Set<string>() : ancestrySet(selected, layout.nodes);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<BloomPan>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<BloomDragState | null>(null);
  const suppressNodeClickRef = useRef(false);
  const lastActivationRef = useRef<BloomNodeActivation | null>(null);
  const visibleBounds = scaledBounds(layout.bounds, zoom, pan);
  const viewBox = `${visibleBounds.minX} ${visibleBounds.minY} ${visibleBounds.width} ${visibleBounds.height}`;

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [layout.bounds.minX, layout.bounds.minY, layout.bounds.width, layout.bounds.height]);

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
    if (nodeElement === undefined || nodeElement === null || !svgRef.current?.contains(nodeElement)) return null;
    const { bloomNodeId, bloomRunId } = nodeElement.dataset;
    if (bloomNodeId === undefined || bloomRunId === undefined) return null;
    return { nodeId: bloomNodeId, runId: bloomRunId, timestamp: window.performance.now() };
  };
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPan: pan,
      moved: false,
    };
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
    const previous = lastActivationRef.current;
    lastActivationRef.current = activation;
    if (
      previous !== null &&
      previous.nodeId === activation.nodeId &&
      activation.timestamp - previous.timestamp < 360
    ) {
      openInnerRun(activation.runId);
      return;
    }
    onSelect(activation.nodeId);
  };
  const panBy = (direction: 'left' | 'right' | 'up' | 'down') => {
    const stepX = layout.bounds.width * 0.1 / zoom;
    const stepY = layout.bounds.height * 0.1 / zoom;
    setPan((current) => ({
      x: current.x + (direction === 'left' ? -stepX : direction === 'right' ? stepX : 0),
      y: current.y + (direction === 'up' ? -stepY : direction === 'down' ? stepY : 0),
    }));
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
    <section className="outer-bloom-graph-panel" style={graphPanel} aria-label="Radial bloom graph">
      <svg
        ref={svgRef}
        className="outer-bloom-svg"
        viewBox={viewBox}
        role="img"
        aria-label="Radial bloom of runs"
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

        {layout.edges.map((edge) => {
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

        {layout.nodes.map((node) => {
          const isSelected = node.id === selected?.id;
          const isPathNode = selectedPath.has(node.id);
          const isDimmed = selected !== null && !isPathNode;
          const fill = colorForBloomNode(node);
          const label = labelPlacement(node);
          const showLabel = node.stage !== 'doppl' || isSelected || layout.nodes.length <= 3;
          const haloOpacity = haloOpacityForNode(node, isSelected, isPathNode);
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
              style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
              opacity={isDimmed ? 0.84 : 1}
            >
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
                stroke={isSelected ? 'var(--fg-default)' : 'color-mix(in srgb, white 42%, transparent)'}
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
          aria-label="Bloom zoom controls"
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
          <GraphControl label="Focus selected artifact" disabled={selected === null} onClick={focusSelected}>
            Focus
          </GraphControl>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 30px)',
            gap: 4,
            padding: 'var(--space-1)',
            border: 'thin solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--bg-surface) 86%, transparent)',
          }}
          aria-label="Bloom pan controls"
        >
          <span />
          <GraphControl label="Pan up" onClick={() => panBy('up')}>
            ↑
          </GraphControl>
          <span />
          <GraphControl label="Pan left" onClick={() => panBy('left')}>
            ←
          </GraphControl>
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              color: 'var(--fg-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-caption)',
            }}
          >
            {Math.round(zoom * 100)}
          </span>
          <GraphControl label="Pan right" onClick={() => panBy('right')}>
            →
          </GraphControl>
          <span />
          <GraphControl label="Pan down" onClick={() => panBy('down')}>
            ↓
          </GraphControl>
          <span />
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

function ProofBoard({
  island,
  selected,
}: {
  island: OuterBloomIsland | null;
  selected: OuterBloomNode | null;
}) {
  const nodes = island?.nodes ?? [];
  const selectedCount = nodes.filter((node) => node.stage === 'doppl' && node.status === 'selected').length;
  const rejectedCount = nodes.filter((node) => ['rejected', 'culled', 'invalid'].includes(node.status)).length;
  const scoredCount = nodes.filter((node) => node.score !== null || node.judgeAcceptance !== null).length;
  const sequenceThrough = island?.sequenceThrough ?? 0;
  return (
    <section style={panel} aria-label="Bloom proof board">
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
          <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--fg-muted)', fontSize: 'var(--text-body-sm)' }}>
            {selected === null
              ? 'Select an artifact to inspect its local bloom evidence.'
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
}: {
  node: OuterBloomNode | null;
  island: OuterBloomIsland | null;
}) {
  const children = island?.nodes.filter((childNode) => childNode.parentId === node?.id) ?? [];
  const lineage = node === null || island === null ? [] : lineageForNode(node, island.nodes);
  return (
    <aside style={panel} aria-label="Bloom inspector">
      <div style={panelHeader}>
        <h2 style={panelTitle}>Inspector</h2>
      </div>
      {node === null ? (
        <div style={inspectorBody}>
          <p style={{ color: 'var(--fg-muted)' }}>Select a bloom node to inspect it.</p>
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
          {lineage.length > 1 && (
            <div style={{ borderTop: 'thin solid var(--border-subtle)', paddingTop: 'var(--space-3)' }}>
              <h3 style={panelTitle}>Lineage</h3>
              <ol
                style={{
                  margin: 'var(--space-2) 0 0',
                  paddingLeft: '1.2rem',
                  color: 'var(--fg-muted)',
                  display: 'grid',
                  gap: 'var(--space-1)',
                }}
              >
                {lineage.map((lineageNode) => (
                  <li key={lineageNode.id}>
                    <span style={{ color: colorForBloomNode(lineageNode) }}>{labelForStage(lineageNode.stage)}</span>
                    {' · '}
                    {truncate(lineageNode.label, 52)}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {children.length > 0 && (
            <div style={{ borderTop: 'thin solid var(--border-subtle)', paddingTop: 'var(--space-3)' }}>
              <h3 style={panelTitle}>Children</h3>
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
        </div>
      )}
    </aside>
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

function layoutBloom(bloom: OuterBloomProjection) {
  const islandCount = Math.max(1, bloom.islands.length);
  const islandRadius = islandCount === 1 ? 0 : Math.max(460, islandCount * 124);
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
    const branchAngle = islandCount === 1 ? 0 : islandAngle;

    const explicitRoots = island.nodes.filter((node) => node.parentId === null);
    const rootNodes = explicitRoots.length > 0 ? explicitRoots : island.nodes.slice(0, 1);

    rootNodes.forEach((node, rootIndex) => {
      const rootSpread = rootNodes.length === 1 ? 0 : (rootIndex - (rootNodes.length - 1) / 2) * 0.34;
      const rootAngle = branchAngle + rootSpread;
      const rootOffset =
        islandCount === 1
          ? { x: -220, y: (rootIndex - (rootNodes.length - 1) / 2) * 92 }
          : { x: -Math.cos(rootAngle) * 58, y: -Math.sin(rootAngle) * 58 };
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
        parent: layoutNode,
        childrenByParent,
        placed,
        nodes,
        islandIndex,
        baseAngle: rootAngle,
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
  parent,
  childrenByParent,
  placed,
  nodes,
  islandIndex,
  baseAngle,
  depth,
}: {
  parent: LayoutNode;
  childrenByParent: Map<string, OuterBloomNode[]>;
  placed: Map<string, LayoutNode>;
  nodes: LayoutNode[];
  islandIndex: number;
  baseAngle: number;
  depth: number;
}) {
  const children = childrenByParent.get(parent.id) ?? [];
  if (children.length === 0) return;

  const stageSpread =
    parent.stage === 'case_study'
      ? Math.PI * 0.18
      : parent.stage === 'problem_recovery'
        ? Math.PI * 0.95
        : Math.PI * 0.78;
  const spread = children.length === 1 ? 0 : Math.min(stageSpread, Math.PI * 0.2 * (children.length - 1));
  const distance =
    parent.stage === 'case_study'
      ? 196
      : parent.stage === 'problem_recovery'
        ? 168
        : 126 + Math.min(56, depth * 12);

  children.forEach((child, index) => {
    if (placed.has(child.id)) return;
    const offset = children.length === 1 ? 0 : -spread / 2 + (spread * index) / (children.length - 1);
    const angle = baseAngle + offset + deterministicWobble(child.id, 0.08);
    const lobe = deterministicWobble(`${child.id}:lobe`, 18);
    const layoutNode = {
      ...child,
      x: parent.x + Math.cos(angle) * (distance + lobe),
      y: parent.y + Math.sin(angle) * (distance + lobe),
      radius: radiusForNode(child),
      islandIndex,
    };
    nodes.push(layoutNode);
    placed.set(child.id, layoutNode);
    placeChildren({
      parent: layoutNode,
      childrenByParent,
      placed,
      nodes,
      islandIndex,
      baseAngle: angle,
      depth: depth + 1,
    });
  });
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
  if (edge.type === 'recovered') return 'color-mix(in srgb, var(--subtype-zeitgeist) 58%, var(--fg-faint))';
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

function labelPlacement(node: LayoutNode): { dx: number; dy: number; anchor: 'start' | 'middle'; max: number } {
  if (node.stage === 'case_study') return { dx: 0, dy: -node.radius - 14, anchor: 'middle', max: 32 };
  if (node.stage === 'problem_recovery') return { dx: 0, dy: node.radius + 24, anchor: 'middle', max: 34 };
  return { dx: 0, dy: node.radius + 22, anchor: 'middle', max: 28 };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function formatScore(value: number | null): string {
  if (value === null) return 'not scored';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function defaultBloomSelection(bloom: OuterBloomProjection): string | null {
  const nodes = bloom.islands.flatMap((island) => island.nodes);
  return (
    nodes.find((node) => node.stage === 'doppl' && node.status === 'selected')?.id ??
    nodes.find((node) => node.stage === 'doppl')?.id ??
    nodes.find((node) => node.stage === 'problem_recovery')?.id ??
    nodes[0]?.id ??
    null
  );
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
      const edges = island.edges.filter((edge) => keepIds.has(edge.source) && keepIds.has(edge.target));
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
    return sorted.sort((a, b) => (normalizedNodeStrength(b) ?? -1) - (normalizedNodeStrength(a) ?? -1));
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
    (count, island) => count + island.nodes.filter((node) => node.stage === 'problem_recovery').length,
    0,
  );
  const selected = islands.reduce(
    (count, island) =>
      count + island.nodes.filter((node) => node.stage === 'doppl' && node.status === 'selected').length,
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

function lineageForNode(selected: OuterBloomNode, nodes: readonly OuterBloomNode[]): OuterBloomNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lineage: OuterBloomNode[] = [];
  let cursor: OuterBloomNode | undefined = selected;
  while (cursor !== undefined) {
    lineage.push(cursor);
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
  }
  return lineage.reverse();
}

function haloOpacityForNode(node: OuterBloomNode, isSelected: boolean, isPathNode: boolean): number {
  if (isSelected) return 0.98;
  if (isPathNode) return 0.62;
  const score = node.score ?? node.judgeAcceptance ?? 0;
  const scaled = Math.max(0, Math.min(1, score > 1 ? score / 5 : score));
  return 0.2 + scaled * 0.34;
}
