import type { RunEventEnvelope, RunEventType } from '../data/contracts';

/**
 * The client run-store reducer: a pure fold of validated `RunEventEnvelope` events into a
 * live-rendering view state, keyed strictly by per-run `sequence`. This is NOT a re-implementation
 * of the backend current-state projection (P6.2) — it is the minimal state the P7.3+ panels render
 * (per-entity latest status + retained failures); detailed entity data is fetched from the REST
 * projections via `runClient`. The fold is idempotent and `occurredAt` is never consulted (safety
 * rule #2 — SSE is non-authoritative, ordering is by `sequence` alone), so a fresh full load, a
 * resync, and replay all reach the same state.
 */

export type RunMode = 'live' | 'replay';
export type EntityKind = 'run' | 'generation' | 'agenome' | 'candidate';

export interface EntityView {
  readonly id: string;
  readonly kind: EntityKind;
  readonly status: RunEventType;
  readonly lastSequence: number;
}

export interface ViewState {
  readonly runId: string | null;
  readonly lastSequence: number | null;
  readonly entities: Readonly<Record<string, EntityView>>;
  readonly failures: readonly RunEventEnvelope[];
}

export const emptyViewState: ViewState = {
  runId: null,
  lastSequence: null,
  entities: {},
  failures: [],
};

/** The 7 failure / terminal event types retained as partial evidence, never dropped (REQ-O-002). */
const FAILURE_EVENT_TYPES = new Set<RunEventType>([
  'provider_call_failed',
  'output_schema_rejected',
  'candidate_invalidated',
  'energy_exhausted',
  'generation_failed',
  'reproduction_aborted_insufficient_parents',
  'novelty_scoring_degraded',
]);

export function isFailureEvent(type: RunEventType): boolean {
  return FAILURE_EVENT_TYPES.has(type);
}

/** The entity an event pertains to — the most specific id present (candidate > agenome > generation > run). */
function resolveEntity(envelope: RunEventEnvelope): { id: string; kind: EntityKind } {
  if (envelope.candidateId !== undefined) return { id: envelope.candidateId, kind: 'candidate' };
  if (envelope.agenomeId !== undefined) return { id: envelope.agenomeId, kind: 'agenome' };
  if (envelope.generationId !== undefined) {
    return { id: envelope.generationId, kind: 'generation' };
  }
  return { id: envelope.runId, kind: 'run' };
}

/**
 * Fold one validated envelope into the view state, keyed by per-run `sequence`. IDEMPOTENT: an
 * envelope whose `sequence <= lastSequence` is already applied and returns the SAME state reference,
 * so a re-fold or a seed/delta overlap never double-counts; `occurredAt` is never consulted.
 */
export function applyEvent(state: ViewState, envelope: RunEventEnvelope): ViewState {
  if (state.lastSequence !== null && envelope.sequence <= state.lastSequence) {
    return state;
  }
  const { id, kind } = resolveEntity(envelope);
  const entities: Record<string, EntityView> = {
    ...state.entities,
    [id]: { id, kind, status: envelope.type, lastSequence: envelope.sequence },
  };
  const failures = isFailureEvent(envelope.type) ? [...state.failures, envelope] : state.failures;
  return {
    runId: state.runId ?? envelope.runId,
    lastSequence: envelope.sequence,
    entities,
    failures,
  };
}

/** Fold a batch (a fresh full load, a REST resync, or replay) — equivalent to applying each in order. */
export function foldEvents(
  events: readonly RunEventEnvelope[],
  initial: ViewState = emptyViewState,
): ViewState {
  return events.reduce(applyEvent, initial);
}
