import { describe, expect, test } from 'vitest';
import { Agenome, CURRENT_SCHEMA_VERSION, ReproductionEvent, validAgenome } from '@doppl/contracts';
import type { RunEventEnvelope } from '@doppl/contracts';
import { applyMutation } from '../../../../src/selection/reproduction/mutate';
import type { MutationBounds } from '../../../../src/selection/reproduction/mutate';
import {
  abortInsufficientParents,
  reproduceMutationOnly,
} from '../../../../src/selection/reproduction/degenerate';
import type { SelectionEmitter } from '../../../../src/selection/reproduction/degenerate';

type Emitted = Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>;

function recorder(): { emit: SelectionEmitter; events: Emitted[] } {
  const events: Emitted[] = [];
  let seq = 0;
  const emit: SelectionEmitter = (env) => {
    events.push(env);
    return Promise.resolve({ sequence: seq++ });
  };
  return { emit, events };
}

function idFactory(): () => string {
  let n = 0;
  return () => `child_${n++}`;
}

const bounds: MutationBounds = {
  personaWeightDelta: 0.1,
  spawnBudgetDelta: 2,
  toolPermissionAllowlist: ['search', 'calc', 'web'],
};

const survivor: Agenome = {
  ...validAgenome,
  id: 'agn_survivor',
  personaWeights: { curiosity: 0.5 },
  toolPermissions: ['search'],
};

const context = { runId: 'run_1', generationId: 'gen_1', seed: 42 };

/**
 * degenerate (P5.10, §3/§8) — the degenerate reproduction fallbacks. 1 eligible parent → mutation_only
 * (reuse the bounded RNG-persisted P5.8 mutate); 0 → abort + zeroSurvivors. No fusion with <2 parents.
 */
describe('degenerate — mutation_only fallback + abort', () => {
  // 1 — spec(§3): a single survivor → a mutate'd child, mode mutation_only, parentIds:[survivor].
  test('mutation_only_from_single_survivor', async () => {
    const { emit } = recorder();
    const { child, reproductionEvent } = await reproduceMutationOnly(survivor, context, {
      emit,
      newId: idFactory(),
      bounds,
    });
    expect(reproductionEvent.mode).toBe('mutation_only');
    expect(child.parentIds).toEqual(['agn_survivor']);
    expect(child.status).toBe('seeded');
    expect(() => Agenome.parse(child)).not.toThrow();
  });

  // 2 — spec(§8): the ReproductionEvent (mode mutation_only, crossoverPoints []) parses; one
  // agenome.reproduced emitted with explicit validation; correct envelope.
  test('mutation_only_event_validates', async () => {
    const { emit, events } = recorder();
    const { reproductionEvent } = await reproduceMutationOnly(survivor, context, {
      emit,
      newId: idFactory(),
      bounds,
    });
    expect(reproductionEvent.crossoverPoints).toEqual([]);
    expect(() => ReproductionEvent.parse(reproductionEvent)).not.toThrow();
    const emitted = events.filter((e) => e.type === 'agenome.reproduced');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.actor).toBe('selection_controller');
    expect(emitted[0]!.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  // 3 — rule #7: the child is reconstructable from the persisted mutationSummary via applyMutation
  // (no re-sample), deep-equal.
  test('mutation_only_reuses_persisted_mutation', async () => {
    const { emit } = recorder();
    const { child, reproductionEvent } = await reproduceMutationOnly(survivor, context, {
      emit,
      newId: idFactory(),
      bounds,
    });
    const replayed = applyMutation(survivor, reproductionEvent.mutationSummary, {
      newId: () => reproductionEvent.childAgenomeId,
    });
    expect(replayed).toEqual(child);
  });

  // 4 — spec(§3): 0 eligible → no child, exactly one reproduction_aborted_insufficient_parents (reason).
  test('abort_on_zero_parents', async () => {
    const { emit, events } = recorder();
    await abortInsufficientParents(context, { emit, newId: idFactory() });
    const aborted = events.filter((e) => e.type === 'reproduction_aborted_insufficient_parents');
    expect(aborted).toHaveLength(1);
    expect(typeof aborted[0]!.payload.reason).toBe('string');
  });

  // 5 — spec(§8): neither degenerate path emits a fusion event (no fusion with <2 parents); the
  // functions have no gateway parameter — structurally fusion-free.
  test('degenerate_emits_no_fusion_events', async () => {
    const { emit, events } = recorder();
    await reproduceMutationOnly(survivor, context, { emit, newId: idFactory(), bounds });
    await abortInsufficientParents(context, { emit, newId: idFactory() });
    expect(events.some((e) => e.type === 'fusion.started' || e.type === 'agenome.fused')).toBe(
      false,
    );
  });
});
