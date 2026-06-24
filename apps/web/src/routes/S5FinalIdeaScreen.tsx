import type { CSSProperties } from 'react';
import type { LineageGraphProjection } from '../data/contracts';
import type { RunClient } from '../data/runClient';
import type { EventSourceLike, SseStream, SseStreamOptions } from '../data/sseStream';
import type { RunStore } from '../state/runStore';
import type { RunMode } from '../state/reducer';
import { ModeBanner } from '../components/ds';
import type { ModeBannerMode } from '../components/feedback/ModeBanner';
import { FinalIdeaPanel } from '../panels/FinalIdeaPanel';
import { GenerationComparison } from '../charts/GenerationComparison';
import { useRunObservatory } from './useRunObservatory';

/**
 * S5FinalIdeaScreen (FV.7) — the dedicated S5 Final-Idea / payoff route at /runs/:id/final, the demo
 * headline ("your problem → the final surviving idea"). RE-HOMES + COMPOSES already-shipped pieces: the
 * FinalIdeaPanel (winner card + defensibility proof: fitness, energy, critic gauntlet, subtype checks,
 * transfer-evidence label, traces, evidence links) + the generational-climb GenerationComparison — both
 * wired via the tested useRunObservatory hook (a terminal run forces the final re-fetch so the FINAL
 * winner/graph always render). The winner is the kernel-marked 'selected' lineage node (selectWinner,
 * PD.11 bridge) — displayed verbatim, never re-ranked (rule #6 emit-only); a terminal run with no winner
 * renders the graceful zero-survivors state, never a fabricated idea. Read-only over projections (rule #9
 * — no command/POST); replay reconstructs from persisted events (rule #7). Replaces the FV.1 interim
 * Dashboard mount, mirroring how FV.4's S2OrganismView replaced the S2 interim.
 */
export interface S5FinalIdeaScreenProps {
  runId: string;
  runClient: RunClient;
  mode?: RunMode;
  /** Wired by the route wrapper — clicking the winner's lineage ref jumps to the organism view. */
  onSelectLineageNode?: (dataRef: string) => void;
  baseUrl?: string;
  eventSourceFactory?: (url: string) => EventSourceLike;
  createStream?: (options: SseStreamOptions) => SseStream;
  store?: RunStore;
  refetchDebounceMs?: number;
}

/** Banner state from the store mode + the run's latest run-level RunEventType (mirrors S2OrganismView). */
function bannerMode(mode: RunMode, runStatus: string | undefined): ModeBannerMode {
  if (mode === 'replay') return 'replay';
  if (runStatus === 'run.completed') return 'complete';
  if (runStatus === 'run.failed') return 'failed';
  if (runStatus === 'run.stopped') return 'stopped';
  return 'live';
}

const shell: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
  gap: 'var(--space-4)',
  padding: 'var(--space-5)',
  alignItems: 'start',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
};
const bannerRow: CSSProperties = {
  gridColumn: '1 / -1',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
};
const payoffCol: CSSProperties = { display: 'grid', gap: 'var(--space-4)', alignContent: 'start' };
const climbCol: CSSProperties = { display: 'grid', gap: 'var(--space-3)', alignContent: 'start' };
const railHeading: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  margin: 0,
};

export function S5FinalIdeaScreen({
  runId,
  runClient,
  mode = 'live',
  onSelectLineageNode,
  baseUrl = '/api',
  eventSourceFactory,
  createStream,
  store: injectedStore,
  refetchDebounceMs,
}: S5FinalIdeaScreenProps) {
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
    <main aria-label="Doppl final idea" style={shell}>
      <div style={bannerRow}>
        <ModeBanner mode={bannerMode(obs.store.getMode(), obs.runStatus)} />
      </div>

      <div style={payoffCol}>
        <FinalIdeaPanel
          runId={runId}
          lineage={obs.lineage ?? emptyLineage(runId)}
          events={obs.fold.events}
          runClient={runClient}
          mode={mode}
          runStatus={obs.runStatus}
          {...(onSelectLineageNode ? { onSelectLineageNode } : {})}
        />
      </div>

      <section style={climbCol}>
        <h3 style={railHeading}>Generational climb</h3>
        <GenerationComparison events={obs.fold.events} />
      </section>
    </main>
  );
}

/** A pre-lineage placeholder so the screen mounts before the first fetch resolves (winnerless → the
 *  FinalIdeaPanel's graceful no-winner affordance; never a fabricated idea). */
function emptyLineage(runId: string): LineageGraphProjection {
  return { runId, nodes: [], edges: [], sequenceThrough: 0 };
}
