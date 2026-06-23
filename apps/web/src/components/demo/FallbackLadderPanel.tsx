import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RunConfig } from '../../data/contracts';
import type { RunClient, StartRunResult } from '../../data/runClient';
import type { RungDescriptor } from '../../data/fallbackLadderClient';

/**
 * FallbackLadderPanel (PD.12, ARCHITECTURE.md §12/§17) — the operator's 3-rung demo fallback UI. On mount
 * it fetches GET /demo/fallback-ladder (injected `runClient` — no `apps/api` import, no direct fetch, no
 * secret); renders the 3 rungs (low-cap-live · prepared · replay); the operator selects a rung; Start posts
 * the active rung's config: low-cap-live → `startRun` with the LOWERED caps over the prepared base ·
 * prepared → the prepared `RunConfig` · replay → `onReplay(replayRunId)` (the shell mounts the recorded
 * replay; NO POST — rule #2). Read-only over the route + the single POST command. Each rung is a labeled
 * button (shape + label, never color alone — §12); the active rung carries `aria-pressed`.
 */
export interface FallbackLadderPanelProps {
  runClient: Pick<RunClient, 'getFallbackLadder' | 'startRun'>;
  /** The replay rung hands its recorded runId to the shell (which mounts the labeled replay view). */
  onReplay: (replayRunId: string) => void;
  onStarted?: (run: StartRunResult) => void;
}

const section: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
  padding: 'var(--space-5)',
};
const rungButton = (active: boolean): CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: active ? 'var(--fg-on-accent)' : 'var(--fg-default)',
  background: active ? 'var(--accent)' : 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
  marginBottom: 'var(--space-2)',
  cursor: 'pointer',
});

export function FallbackLadderPanel({ runClient, onReplay, onStarted }: FallbackLadderPanelProps) {
  const [rungs, setRungs] = useState<RungDescriptor[]>([]);
  const [activeKind, setActiveKind] = useState<RungDescriptor['kind']>('low-cap-live');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Fetch the ladder rung descriptors on mount (read-only; a fetch failure is shown, never thrown).
  useEffect(() => {
    let active = true;
    runClient
      .getFallbackLadder()
      .then((r) => active && setRungs(r))
      .catch(() => active && setError('Failed to load the fallback ladder.'));
    return () => {
      active = false;
    };
  }, [runClient]);

  const activeRung = rungs.find((r) => r.kind === activeKind);
  const preparedRung = rungs.find((r) => r.kind === 'prepared');

  const handleStart = () => {
    if (starting || activeRung === undefined) return;
    // Replay: hand the recorded runId to the shell — no POST (rule #2 — replay mounts, never starts a run).
    if (activeRung.kind === 'replay') {
      onReplay(activeRung.replayRunId);
      return;
    }
    // low-cap-live borrows the prepared rung as its base RunConfig + swaps in the lowered caps; prepared
    // posts its RunConfig verbatim. (The low-cap-live rung carries only `caps` by its frozen type.)
    let config: RunConfig;
    if (activeRung.kind === 'prepared') {
      config = activeRung.runConfig;
    } else if (preparedRung !== undefined) {
      config = { ...preparedRung.runConfig, caps: activeRung.caps };
    } else {
      setError('Prepared base configuration unavailable.');
      return;
    }
    setError(null);
    setStarting(true);
    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined;
    runClient
      .startRun(config, idempotencyKey !== undefined ? { idempotencyKey } : undefined)
      .then((run) => onStarted?.(run))
      .catch(() => setError('Failed to start the run — retry.'))
      .finally(() => setStarting(false));
  };

  return (
    <section aria-label="Demo fallback ladder" style={section}>
      <h2 style={{ fontSize: 'var(--text-h2)', margin: 0, marginBottom: 'var(--space-5)' }}>
        Demo fallback ladder
      </h2>
      <div role="group" aria-label="Fallback rung">
        {rungs.map((rung) => (
          <button
            key={rung.kind}
            type="button"
            aria-pressed={rung.kind === activeKind}
            onClick={() => setActiveKind(rung.kind)}
            style={rungButton(rung.kind === activeKind)}
          >
            Select {rung.kind}
          </button>
        ))}
      </div>

      {error && (
        <span
          role="alert"
          style={{
            color: 'var(--danger)',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-caption)',
          }}
        >
          {error}
        </span>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={starting || activeRung === undefined}
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-label)',
          fontWeight: 600,
          color: 'var(--fg-on-accent)',
          background: 'var(--accent)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-2) var(--space-5)',
          cursor: 'pointer',
          marginTop: 'var(--space-3)',
        }}
      >
        {starting ? 'Starting…' : 'Start'}
      </button>
    </section>
  );
}
