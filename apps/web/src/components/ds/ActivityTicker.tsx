/**
 * ActivityTicker — the live heartbeat. A streaming, reverse-chron feed of the kernel's RunEvents so
 * the room FEELS the organism working in real time. Fed by the sequence-keyed SSE reducer; ordered
 * by `sequence` only (the kernel's sole ordering key — never occurredAt). TS-strict port of
 * docs/doppl-design-system/components/observatory/ActivityTicker.jsx (adherence-clean — var() tokens,
 * the prototype's raw-px paddings + grid template → --space tokens / auto columns).
 */
export interface TickerEvent {
  sequence?: number;
  /** Canonical RunEventType, e.g. "agenome.fused", "fitness.scored", "energy.spent". */
  type: string;
  /** Actor role, e.g. "kernel", "selection", "critic". */
  actor?: string;
  /** Human phrase, e.g. "ag_a3 fused from ag_a0 + ag_a2". */
  phrase?: string;
  label?: string;
  /** ISO string or epoch ms — drives the relative "2s" stamp. */
  occurredAt?: string | number;
}

export interface ActivityTickerProps {
  events: TickerEvent[];
  mode?: 'live' | 'replay';
  maxRows?: number;
  title?: string;
}

interface EventSpec {
  glyph: string;
  color: string;
}

const EVENT: Record<string, EventSpec> = {
  'run.configured': { glyph: '●', color: '--accent' },
  'run.started': { glyph: '●', color: '--accent' },
  'run.completed': { glyph: '✔', color: '--success' },
  'run.failed': { glyph: '△', color: '--danger' },
  'run.stopped': { glyph: '■', color: '--warning' },
  'generation.started': { glyph: '▸', color: '--accent' },
  'generation.completed': { glyph: '▪', color: '--fg-muted' },
  'agenome.spawned': { glyph: '◌', color: '--status-active' },
  'agenome.fused': { glyph: '⚇', color: '--status-reproduced' },
  'agenome.mutated': { glyph: '∿', color: '--status-mutated' },
  'agenome.reproduced': { glyph: '⚇', color: '--status-reproduced' },
  'candidate.created': { glyph: '·', color: '--status-created' },
  'critic.reviewed': { glyph: '⊘', color: '--status-checked' },
  'check.completed': { glyph: '✓', color: '--check-passed' },
  'novelty.scored': { glyph: '◈', color: '--novelty-fill' },
  'fitness.scored': { glyph: '✦', color: '--status-selected' },
  'lineage.culled': { glyph: '✕', color: '--status-culled' },
  'energy.spent': { glyph: '⚡', color: '--energy-full' },
  provider_call_failed: { glyph: '△', color: '--danger' },
  energy_exhausted: { glyph: '▽', color: '--warning' },
  novelty_scoring_degraded: { glyph: '⚠', color: '--warning' },
};

function ago(occurredAt: TickerEvent['occurredAt']): string {
  if (occurredAt == null) return '';
  const t = typeof occurredAt === 'number' ? occurredAt : Date.parse(occurredAt);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
}

export function ActivityTicker({
  events,
  mode = 'live',
  maxRows = 12,
  title = 'Activity',
}: ActivityTickerProps) {
  const rows = events.slice(-maxRows).reverse();
  const isReplay = mode === 'replay';
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        background: 'var(--bg-surface)',
        border: 'thin solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 'var(--space-2) var(--space-3)',
          borderBottom: 'thin solid var(--border-subtle)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-faint)',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isReplay ? 'var(--warning)' : 'var(--accent)',
            boxShadow: isReplay ? 'none' : 'var(--glow-active)',
            animation: isReplay
              ? 'none'
              : 'doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite',
          }}
        />
        <span>{title}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-ui)' }}>
          {isReplay ? 'replaying' : 'live'}
        </span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: 'var(--space-1) 0' }}>
        {rows.length === 0 && (
          <div
            style={{
              padding: 'var(--space-4) var(--space-3)',
              fontSize: 12,
              color: 'var(--fg-faint)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            waiting for events…
          </div>
        )}
        {rows.map((e, i) => {
          const spec = EVENT[e.type] ?? { glyph: '•', color: '--fg-muted' };
          return (
            <div
              key={`${e.sequence ?? i}:${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'var(--space-5) auto 1fr auto',
                alignItems: 'baseline',
                gap: 8,
                padding: 'var(--space-1) var(--space-3)',
                fontSize: 12,
                animation: i === 0 ? 'doppl-spawn var(--motion-fast) var(--ease-out)' : undefined,
              }}
            >
              <span aria-hidden="true" style={{ color: `var(${spec.color})`, textAlign: 'center' }}>
                {spec.glyph}
              </span>
              <span style={{ color: 'var(--fg-faint)' }}>#{e.sequence ?? '—'}</span>
              <span
                style={{
                  color: 'var(--fg-default)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: 'var(--fg-muted)' }}>{e.actor ? `${e.actor} ` : ''}</span>
                {e.phrase || e.label || e.type}
              </span>
              <span style={{ color: 'var(--fg-faint)' }}>{ago(e.occurredAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
