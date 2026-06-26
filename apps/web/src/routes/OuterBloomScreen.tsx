import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ds';
import type { RunClient } from '../data/runClient';
import type { OuterBloomIsland, OuterBloomNode, OuterBloomProjection } from '../data/outerBloom';

interface OuterBloomScreenProps {
  runClient: RunClient;
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly bloom: OuterBloomProjection };

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
  gap: 'var(--space-4)',
  alignItems: 'end',
  padding: 'var(--space-5) var(--space-5) var(--space-3)',
  borderBottom: 'thin solid var(--border-subtle)',
};
const eyebrow: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--accent)',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
};
const title: CSSProperties = {
  margin: 'var(--space-1) 0 0',
  fontSize: 'clamp(1.8rem, 3vw, 3.2rem)',
  lineHeight: 1,
  letterSpacing: 0,
};
const subtitle: CSSProperties = {
  margin: 'var(--space-2) 0 0',
  color: 'var(--fg-muted)',
  maxWidth: '62rem',
};
const statRail: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(86px, 1fr))',
  gap: 'var(--space-2)',
};
const statCard: CSSProperties = {
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-surface)',
  padding: 'var(--space-2) var(--space-3)',
};
const statValue: CSSProperties = { display: 'block', fontWeight: 800, fontSize: 'var(--text-h3)' };
const statLabel: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const body: CSSProperties = {
  minHeight: 0,
  height: 'calc(100vh - 220px)',
  display: 'grid',
  gridTemplateColumns: '280px minmax(0, 1fr) 340px',
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

export function OuterBloomScreen({ runClient }: OuterBloomScreenProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    runClient
      .getOuterBloom()
      .then((bloom) => {
        if (!active) return;
        setState({ kind: 'ready', bloom });
        setSelectedId((current) => current ?? bloom.islands[0]?.nodes[0]?.id ?? null);
      })
      .catch(() => active && setState({ kind: 'error' }));
    return () => {
      active = false;
    };
  }, [runClient, reloadKey]);

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

  const selected =
    state.bloom.islands.flatMap((island) => island.nodes).find((node) => node.id === selectedId) ??
    state.bloom.islands[0]?.nodes[0] ??
    null;

  return (
    <main aria-label="Outer bloom view" style={shell}>
      <header className="outer-bloom-header" style={header}>
        <div>
          <p style={eyebrow}>Outer View</p>
          <h1 style={title}>Bloom Map</h1>
          <p style={subtitle}>
            Case-study islands and their generated problem recoveries and Doppl leaves, projected from
            the kernel run log. Open a node to inspect the selected outer artifact.
          </p>
        </div>
        <div className="outer-bloom-stats" style={statRail} aria-label="Bloom totals">
          <Stat value={state.bloom.totals.runs} label="runs" />
          <Stat value={state.bloom.totals.problemRecoveries} label="problem recoveries" />
          <Stat value={state.bloom.totals.doppls} label="doppls" />
          <Stat value={state.bloom.totals.selected} label="selected" />
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
          <aside style={panel} aria-label="Bloom islands">
            <div style={panelHeader}>
              <h2 style={panelTitle}>Islands</h2>
            </div>
            <div style={islandList}>
              {state.bloom.islands.map((island) => (
                <button
                  key={island.runId}
                  type="button"
                  style={{
                    ...islandButton,
                    borderColor:
                      island.nodes.some((node) => node.id === selected?.id)
                        ? 'var(--accent)'
                        : 'var(--border-subtle)',
                  }}
                  onClick={() => setSelectedId(island.nodes[0]?.id ?? null)}
                >
                  <strong>{island.nodes[0]?.label ?? island.runId}</strong>
                  <span style={{ display: 'block', color: 'var(--fg-muted)', marginTop: 4 }}>
                    {island.nodes.filter((node) => node.stage === 'problem_recovery').length} PR ·{' '}
                    {island.nodes.filter((node) => node.stage === 'doppl').length} doppls ·{' '}
                    {island.status ?? 'unknown'}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <BloomGraph
            bloom={state.bloom}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />

          <Inspector node={selected} />
        </section>
      )}
    </main>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={statCard}>
      <span style={statValue}>{value}</span>
      <span style={statLabel}>{label}</span>
    </div>
  );
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
  const viewBox = `${layout.bounds.minX} ${layout.bounds.minY} ${layout.bounds.width} ${layout.bounds.height}`;

  return (
    <section className="outer-bloom-graph-panel" style={graphPanel} aria-label="Radial bloom graph">
      <svg
        className="outer-bloom-svg"
        viewBox={viewBox}
        role="img"
        aria-label="Radial bloom of runs"
        style={svgStyle}
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

        {layout.edges.map((edge) => (
          <line
            key={edge.id}
            x1={edge.source.x}
            y1={edge.source.y}
            x2={edge.target.x}
            y2={edge.target.y}
            stroke="var(--fg-faint)"
            strokeWidth={edge.type === 'seeded' ? 1.3 : 1}
            strokeOpacity={edge.type === 'seeded' ? 0.48 : 0.32}
          />
        ))}

        {layout.nodes.map((node) => {
          const isSelected = node.id === selected?.id;
          const fill = colorForBloomNode(node);
          const label = labelPlacement(node);
          const showLabel = node.stage !== 'doppl' || isSelected || layout.nodes.length <= 3;
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              aria-label={node.label}
              onClick={() => onSelect(node.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(node.id);
              }}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={node.x} cy={node.y} r={node.radius * 3.4} fill="url(#bloom-halo)" />
              <circle
                cx={node.x}
                cy={node.y}
                r={node.radius}
                fill={fill}
                filter={isSelected ? 'url(#bloom-glow)' : undefined}
                stroke={isSelected ? 'var(--fg-default)' : 'color-mix(in srgb, white 42%, transparent)'}
                strokeWidth={isSelected ? 3 : 1.2}
              />
              {showLabel && (
                <text
                  x={node.x + label.dx}
                  y={node.y + label.dy}
                  textAnchor={label.anchor}
                  fill={isSelected ? 'var(--fg-default)' : 'var(--fg-muted)'}
                  fontFamily="var(--font-mono)"
                  fontSize="11"
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

function Inspector({ node }: { node: OuterBloomNode | null }) {
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
          </div>
          <h2 style={{ margin: 0, fontSize: 'var(--text-h3)', lineHeight: 1.15 }}>{node.label}</h2>
          <p style={{ margin: 0, color: 'var(--fg-muted)', lineHeight: 1.55 }}>{node.summary}</p>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <Metric label="fitness" value={formatScore(node.score)} />
            <Metric label="novelty" value={formatScore(node.novelty)} />
            <Metric label="judge" value={formatScore(node.judgeAcceptance)} />
          </div>
          {node.sourceId !== null && (
            <Button variant="secondary" glyph="↗" onClick={() => window.open(`/runs/${node.runId}`, '_self')}>
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
  const islandRadius = islandCount === 1 ? 0 : Math.max(360, islandCount * 92);
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

    for (const node of island.nodes) {
      if (node.stage !== 'case_study') continue;
      const layoutNode = { ...node, x: center.x, y: center.y, radius: 12, islandIndex };
      nodes.push(layoutNode);
      placed.set(node.id, layoutNode);
      placeChildren({
        parent: layoutNode,
        childrenByParent,
        placed,
        nodes,
        islandIndex,
        baseAngle: islandAngle - Math.PI / 2,
        depth: 1,
      });
    }

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

  const spread = children.length === 1 ? 0 : Math.min(Math.PI * 0.92, Math.PI * 0.22 * (children.length - 1));
  const distance = parent.stage === 'case_study' ? 112 : 104 + Math.min(44, depth * 10);

  children.forEach((child, index) => {
    if (placed.has(child.id)) return;
    const offset = children.length === 1 ? 0 : -spread / 2 + (spread * index) / (children.length - 1);
    const angle = baseAngle + offset;
    const layoutNode = {
      ...child,
      x: parent.x + Math.cos(angle) * distance,
      y: parent.y + Math.sin(angle) * distance,
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
  const pad = 180;
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function radiusForNode(node: OuterBloomNode): number {
  const score = node.score ?? node.judgeAcceptance ?? 0.3;
  const scaled = Math.max(0, Math.min(1, score > 1 ? score / 5 : score));
  return 7 + scaled * 8 + (node.status === 'selected' ? 4 : 0);
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
  if (node.stage === 'case_study') return { dx: node.radius + 12, dy: 4, anchor: 'start', max: 26 };
  if (node.stage === 'problem_recovery') return { dx: 0, dy: node.radius + 20, anchor: 'middle', max: 32 };
  return { dx: 0, dy: node.radius + 20, anchor: 'middle', max: 28 };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function formatScore(value: number | null): string {
  if (value === null) return 'not scored';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
