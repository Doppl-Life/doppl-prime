import { Agenome, CURRENT_SCHEMA_VERSION, ReproductionEvent } from '@doppl/contracts';
import type { RunEventEnvelope } from '@doppl/contracts';
import { createRng } from './rng';
import { mutate } from './mutate';
import type { MutationBounds } from './mutate';

/**
 * degenerate (P5.10, ARCHITECTURE.md §3/§8) — the `<2`-distinct-parent reproduction fallbacks.
 *
 * `reproduceMutationOnly` (exactly 1 eligible parent): mutates the single survivor via the bounded,
 * RNG-persisted P5.8 `mutate` and emits one `agenome.reproduced{mode:'mutation_only'}` (a
 * `ReproductionEvent` with `parentAgenomeIds:[survivor]`, `crossoverPoints:[]`, the `mutate`
 * `mutationSummary`). `abortInsufficientParents` (0 eligible): emits one
 * `reproduction_aborted_insufficient_parents` — no child; the kernel emits the
 * `generation.completed{survivors:0}` lifecycle terminal (selection never fabricates a parent).
 *
 * The child inherits the survivor's generation (no successor-gen override — gen N+1 doesn't exist at
 * reproduce time; the kernel/P5.11 assigns it at the handoff). Replay reconstructs via `applyMutation`
 * from the persisted `mutationSummary` (rule #7). `agenome.reproduced` is NOT high-traffic, so the
 * producer validates `ReproductionEvent.parse` explicitly before emit.
 */

/**
 * SelectionEmitter — the shared selection-track append seam (envelope minus the server/DB-assigned
 * `sequence`/`occurredAt` = the event-store `AppendInput`; real impl = `EventStore.append`). Introduced
 * here as the single shared type; the earlier per-module emitters (Novelty/Fitness/Cull/Fusion) keep
 * their local aliases.
 */
export type SelectionEmitter = (
  envelope: Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>,
) => Promise<{ sequence: number }>;

export interface DegenerateDeps {
  emit: SelectionEmitter;
  newId: () => string;
  bounds: MutationBounds;
}

export interface ReproductionContext {
  runId: string;
  generationId?: string;
  seed: number;
}

export interface DegenerateOutcome {
  child: Agenome;
  reproductionEvent: ReproductionEvent;
}

export async function reproduceMutationOnly(
  survivor: Agenome,
  context: ReproductionContext,
  deps: DegenerateDeps,
): Promise<DegenerateOutcome> {
  // Mutate the single survivor (child inherits the survivor's generation — see the module note).
  const { child, mutationSummary } = mutate(survivor, createRng(context.seed), deps.bounds, {
    newId: deps.newId,
  });

  const reproductionEvent = ReproductionEvent.parse({
    id: deps.newId(),
    runId: context.runId,
    parentAgenomeIds: [survivor.id],
    childAgenomeId: child.id,
    mode: 'mutation_only',
    crossoverPoints: [],
    mutationSummary,
  });

  await deps.emit({
    runId: context.runId,
    generationId: context.generationId,
    id: deps.newId(),
    type: 'agenome.reproduced',
    actor: 'selection_controller',
    payload: reproductionEvent,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  return { child, reproductionEvent };
}

export async function abortInsufficientParents(
  context: ReproductionContext,
  deps: { emit: SelectionEmitter; newId: () => string },
): Promise<void> {
  await deps.emit({
    runId: context.runId,
    generationId: context.generationId,
    id: deps.newId(),
    type: 'reproduction_aborted_insufficient_parents',
    actor: 'selection_controller',
    // generic payload — the generation context rides the envelope's generationId field.
    payload: { reason: 'fewer than 1 eligible parent — no offspring this generation' },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
}
