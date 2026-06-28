import type { RunEventEnvelope, RunEventType } from '../data/contracts';
import { RUN_TERMINAL_TYPES } from '../components/run/runControl';

/**
 * deriveInFlight — the PURE per-node in-flight derivation deferred from P7.2 (LESSONS §2). It folds the
 * run-event stream, keyed STRICTLY by `sequence` (occurredAt + array order ignored — replay reproduces
 * the identical liveness, §4 / safety rule #2), marking an entity **working** when an operation-start
 * marker is seen WITHOUT its paired completion, and clearing it on the completion. It yields the working
 * *entity ids* (the event candidateId/agenomeId/...) — the lineage component bridges these to nodes via
 * `node.dataRef` (the opaque authoritative pointer the events reference). It is NOT folded into the run-
 * store (that fold stays idempotent + mode-agnostic, LESSONS §2). A live activity feed lists start→finish.
 *
 * NOTE: `judge.review_started` has NO sv2 completion (`judge.reviewed` is sv3/P0.16), so a judge marker
 * stays in-flight under schemaVersion 2 — documented; folds into the sv3 demo→cody reconcile.
 */

export type InFlightOperation =
  | 'generate'
  | 'review'
  | 'check'
  | 'scoring'
  | 'fusion'
  | 'judge'
  | 'tool_call'
  | 'generation_phase';

/** Operation-start marker → the operation it opens. */
const START_MARKERS: Partial<Record<RunEventType, InFlightOperation>> = {
  'candidate.generation_started': 'generate',
  'critic.review_started': 'review',
  'check.started': 'check',
  'novelty.scoring_started': 'scoring',
  'fusion.started': 'fusion',
  'judge.review_started': 'judge',
  'tool_call.started': 'tool_call',
  'generation.verifying': 'generation_phase',
  'generation.scoring': 'generation_phase',
  'generation.reproducing': 'generation_phase',
};

/** Completion event → the operation it closes (no `judge.reviewed` in sv2 — see header note). */
const COMPLETION_MARKERS: Partial<Record<RunEventType, InFlightOperation>> = {
  'candidate.created': 'generate',
  'critic.reviewed': 'review',
  'check.completed': 'check',
  'novelty.scored': 'scoring',
  'agenome.fused': 'fusion',
  'tool_call.finished': 'tool_call',
  'generation.completed': 'generation_phase',
};

/** The most-specific entity id the event pertains to (candidate > agenome > generation > run). */
function resolveEntityId(e: RunEventEnvelope): string {
  return e.candidateId ?? e.agenomeId ?? e.generationId ?? e.runId;
}

export interface ActivityEntry {
  /** `${entityId}::${operation}` — the pairing key for start↔completion. */
  readonly key: string;
  readonly entityId: string;
  readonly operation: InFlightOperation;
  readonly startSequence: number;
  readonly startEventId: string;
  /** Set once the paired completion folds in. */
  readonly endSequence?: number;
  readonly status: 'active' | 'finished';
}

export interface InFlightState {
  /** Entity ids with ≥1 active (unpaired) operation — bridged to nodes via `node.dataRef`. */
  readonly workingEntityIds: ReadonlySet<string>;
  /** The ordered start→finish activity log (by start sequence). */
  readonly feed: readonly ActivityEntry[];
}

export function deriveInFlight(events: readonly RunEventEnvelope[]): InFlightState {
  // `sequence` is the SOLE ordering key (replay-equivalent; occurredAt + input order are irrelevant).
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const active = new Map<string, ActivityEntry>();
  const feed: ActivityEntry[] = [];

  for (const e of ordered) {
    const entityId = resolveEntityId(e);
    const startOp = START_MARKERS[e.type];
    if (startOp !== undefined) {
      const key = `${entityId}::${startOp}`;
      const entry: ActivityEntry = {
        key,
        entityId,
        operation: startOp,
        startSequence: e.sequence,
        startEventId: e.id,
        status: 'active',
      };
      active.set(key, entry);
      feed.push(entry);
      continue;
    }
    const endOp = COMPLETION_MARKERS[e.type];
    if (endOp !== undefined) {
      const key = `${entityId}::${endOp}`;
      const open = active.get(key);
      if (open !== undefined) {
        active.delete(key);
        const idx = feed.indexOf(open);
        if (idx >= 0) feed[idx] = { ...open, endSequence: e.sequence, status: 'finished' };
      }
    }
  }

  // Once the run has TERMINATED (a run.completed/failed/stopped event is in this prefix), nothing is in
  // flight — any operation whose completion event was never emitted (e.g. the sv2 judge review, or a
  // start left unpaired when the run ended) is stale, NOT live. Clear the working set so finished runs
  // don't show perpetual "working…". Replay-safe: scrubbing to a prefix BEFORE the terminal event still
  // shows the in-flight state at that step; at/after it, the set is cleared.
  const terminated = ordered.some((e) => RUN_TERMINAL_TYPES.has(e.type));
  const workingEntityIds = new Set<string>();
  if (!terminated) {
    for (const entry of active.values()) workingEntityIds.add(entry.entityId);
  }
  return { workingEntityIds, feed };
}
