import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

/**
 * ActivityTicker — the live heartbeat. A streaming, ASCENDING feed of the kernel's RunEvents so the
 * room FEELS the organism working in real time: oldest at the top, NEWEST at the bottom, auto-scrolled
 * into view. Fed by the sequence-keyed SSE reducer; ordered by `sequence` only (the kernel's sole
 * ordering key — never occurredAt). The full (non-truncated) list is rendered; a large soft cap only
 * bounds DOM node count. Stick-to-bottom auto-scroll pauses when the operator scrolls up to read
 * history and resumes when they return to the bottom. TS-strict port of
 * docs/doppl-design-system/components/observatory/ActivityTicker.jsx (adherence-clean — var() tokens).
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
  /** Soft DOM cap — only the last `maxRows` events render (bounds node count, NOT a truncation
   *  signal). Large by default so the full feed is visible; events are still ordered ascending. */
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

/** Soft DOM cap — render the last N events only (bounds node count; the feed stays ascending). */
const DEFAULT_MAX_ROWS = 500;
/** Px slop within which the scroll position counts as "at the bottom" → keep auto-following. */
export const STICK_BOTTOM_SLOP_PX = 24;

function ago(occurredAt: TickerEvent['occurredAt']): string {
  if (occurredAt == null) return '';
  const t = typeof occurredAt === 'number' ? occurredAt : Date.parse(occurredAt);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
}

/**
 * Pure stick-to-bottom predicate: is the scroll position within slop of the bottom? Extracted so the
 * auto-follow rule is unit-testable independent of jsdom's (absent) layout engine.
 */
export function isAtBottom(
  metrics: { scrollHeight: number; scrollTop: number; clientHeight: number },
  slop = STICK_BOTTOM_SLOP_PX,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight < slop;
}

export function ActivityTicker({
  events,
  mode = 'live',
  maxRows = DEFAULT_MAX_ROWS,
  title = 'Activity',
}: ActivityTickerProps) {
  // Ascending (oldest→newest): newest renders LAST so it sits at the bottom of the scroll feed.
  const rows = events.slice(-maxRows);
  const isReplay = mode === 'replay';

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Init true: a fresh feed follows the newest event. Toggled off when the operator scrolls up.
  const [stickToBottom, setStickToBottom] = useState(true);

  // On every events change, if following, jump to the newest (bottom). Guards null ref / SSR.
  useEffect(() => {
    if (!stickToBottom) return;
    const el = scrollRef.current;
    if (el == null) return;
    el.scrollTop = el.scrollHeight;
  }, [rows.length, stickToBottom]);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (el == null) return;
    setStickToBottom(
      isAtBottom({
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        clientHeight: el.clientHeight,
      }),
    );
  };

  const jumpToLatest = (): void => {
    const el = scrollRef.current;
    if (el != null) el.scrollTop = el.scrollHeight;
    setStickToBottom(true);
  };

  return (
    <div
      style={{
        position: 'relative',
        fontFamily: 'var(--font-mono)',
        background: 'var(--bg-surface)',
        border: 'thin solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          borderBottom: 'thin solid var(--border-subtle)',
          fontSize: 'var(--text-caption)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-faint)',
        }}
      >
        <span
          style={{
            width: 'var(--space-2)',
            height: 'var(--space-2)',
            borderRadius: 'var(--radius-full)',
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
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: 'var(--space-1) 0' }}
      >
        {rows.length === 0 && (
          <div
            style={{
              padding: 'var(--space-4) var(--space-3)',
              fontSize: 'var(--text-mono-sm)',
              color: 'var(--fg-faint)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            waiting for events…
          </div>
        )}
        {rows.map((e, i) => {
          const spec = EVENT[e.type] ?? { glyph: '•', color: '--fg-muted' };
          // Newest row (last in ascending order) gets the spawn-in animation.
          const isNewest = i === rows.length - 1;
          return (
            <div
              key={`${e.sequence ?? i}:${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'var(--space-5) auto 1fr auto',
                alignItems: 'baseline',
                gap: 'var(--space-2)',
                padding: 'var(--space-1) var(--space-3)',
                fontSize: 'var(--text-mono-sm)',
                animation: isNewest ? 'doppl-spawn var(--motion-fast) var(--ease-out)' : undefined,
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
      {!stickToBottom && rows.length > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 'var(--space-3)',
            bottom: 'var(--space-3)',
            zIndex: 'var(--z-ticker)',
          }}
        >
          <Button variant="secondary" size="sm" glyph="↓" onClick={jumpToLatest}>
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
}
