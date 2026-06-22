import { RunCaps, type RunStatus } from '@doppl/contracts';
import { buildCurrentState } from './current-state';
import type { RunEventRow } from './projection-builder';

/**
 * Run-health projection (ARCHITECTURE.md §11/§12/§4) — a READ-ONLY runtime signal derived purely from
 * the event log (rule #2; no append, no projection write): current generation, candidates-in-flight,
 * operations-in-flight, last-event time, and caps-consumed vs the configured ceilings — the operator's
 * continue-vs-switch-to-replay signal. Distinct from Langfuse; needs no external metrics stack.
 *
 * operations-in-flight = UNPAIRED operation-start markers (count(*_started) − count(completion),
 * clamped ≥0). NOTE: a failed/aborted op (start with no completion due to provider_call_failed/etc.)
 * stays counted under pure count-based pairing — acceptable for the rough signal + matches the literal
 * "unpaired" spec (a failure-decrement is a cheap future refinement). `judge.review_started`'s
 * completion is `judge.reviewed` (sv3, absent on track/demo) → judge is EXCLUDED here (sv3-reconcile).
 * generation.verifying/scoring/reproducing are durable GenerationStatus (in current-state), not ops.
 */

export interface CapUsage {
  consumed: number;
  ceiling: number;
}

/**
 * Named per-cap usage (not a Record) so consumers access fields without an undefined index check.
 *
 * Exposes 4 of the 6 RunCaps. `maxSpawnDepth` and `wallClockTimeoutMs` are intentionally OMITTED here:
 * neither is reconstructible from the projected event stream as a monotonic "consumed" counter —
 * spawn-depth is a per-lineage tree property (not a running total) and wall-clock elapsed is derived
 * from the live clock (out of band of the log-derived projection). They surface at P3/integration when
 * the live worker reports them; the health signal stays a pure projection of the persisted log.
 */
export interface CapsConsumed {
  generations: CapUsage;
  population: CapUsage;
  energy: CapUsage;
  toolCalls: CapUsage;
}

export interface OperationsInFlight {
  total: number;
  byType: Record<string, number>;
}

export interface RunHealth {
  runId: string;
  status: RunStatus | null;
  generationCount: number;
  candidatesInFlight: number;
  operationsInFlight: OperationsInFlight;
  lastEventAt: string | null;
  capsConsumed: CapsConsumed | null;
  sequenceThrough: number;
}

const TERMINAL_CANDIDATE_STATUSES: ReadonlySet<string> = new Set([
  'selected',
  'rejected',
  'culled',
  'invalid',
]);

/** operation-start marker → its completion event (count-based pairing; judge excluded = sv3-reconcile). */
const OPERATION_PAIRS: Readonly<Record<string, readonly [string, string]>> = {
  candidate_generation: ['candidate.generation_started', 'candidate.created'],
  critic: ['critic.review_started', 'critic.reviewed'],
  check: ['check.started', 'check.completed'],
  novelty: ['novelty.scoring_started', 'novelty.scored'],
  fusion: ['fusion.started', 'agenome.fused'],
  tool_call: ['tool_call.started', 'tool_call.finished'],
};

function plainObject(payload: unknown): Record<string, unknown> | null {
  return payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

/** RunCaps read from the persisted `run.configured` payload, or null if absent/invalid. */
function readCaps(events: readonly RunEventRow[]): RunCaps | null {
  for (const event of events) {
    if (event.type !== 'run.configured') continue;
    const parsed = RunCaps.safeParse(plainObject(event.payload)?.caps);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export function buildRunHealth(events: readonly RunEventRow[]): RunHealth {
  const { runId, sequenceThrough, state } = buildCurrentState(events);

  const typeCount = new Map<string, number>();
  let energyConsumed = 0;
  for (const event of events) {
    typeCount.set(event.type, (typeCount.get(event.type) ?? 0) + 1);
    if (event.type === 'energy.spent') {
      const actual = plainObject(event.payload)?.actual;
      if (typeof actual === 'number') energyConsumed += actual;
    }
  }
  const count = (type: string): number => typeCount.get(type) ?? 0;

  const byType: Record<string, number> = {};
  let total = 0;
  for (const [kind, [start, completion]] of Object.entries(OPERATION_PAIRS)) {
    const inFlight = Math.max(0, count(start) - count(completion));
    byType[kind] = inFlight;
    total += inFlight;
  }

  const candidatesInFlight = Object.values(state.candidateIdeas).filter(
    (candidate) => !TERMINAL_CANDIDATE_STATUSES.has(candidate.status),
  ).length;

  const generationCount = Object.keys(state.generations).length;
  const lastEvent = events[events.length - 1];
  const lastEventAt = lastEvent !== undefined ? lastEvent.occurredAt.toISOString() : null;

  const caps = readCaps(events);
  const usage = (consumed: number, ceiling: number): CapUsage => ({
    consumed: Math.min(consumed, ceiling), // CLAMP — never over-report vs the enforced ceiling
    ceiling,
  });
  const capsConsumed: CapsConsumed | null = caps
    ? {
        generations: usage(generationCount, caps.maxGenerations),
        population: usage(Object.keys(state.agenomes).length, caps.maxPopulation),
        energy: usage(energyConsumed, caps.energyBudget),
        toolCalls: usage(count('tool_call.finished'), caps.maxToolCalls),
      }
    : null;

  return {
    runId,
    status: state.runs[runId]?.status ?? null,
    generationCount,
    candidatesInFlight,
    operationsInFlight: { total, byType },
    lastEventAt,
    capsConsumed,
    sequenceThrough,
  };
}
