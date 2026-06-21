import { describe, expect, test } from 'vitest';
import { validAgenome } from '@doppl/contracts';
import type { Agenome, RunEventEnvelope } from '@doppl/contracts';
import { createFakeGateway } from '../../../../src/model-gateway';
import type { ModelGateway } from '../../../../src/model-gateway';
import type { MutationBounds } from '../../../../src/selection/reproduction/mutate';
import type { FusionParent } from '../../../../src/selection/reproduction/parent-distance';
import { applyReproduction, reproduce } from '../../../../src/selection/reproduction/reproduce';
import type {
  ReproduceDeps,
  ReproduceInput,
} from '../../../../src/selection/reproduction/reproduce';

type Emitted = Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>;

function recorder(): { emit: ReproduceDeps['emit']; events: Emitted[] } {
  const events: Emitted[] = [];
  let seq = 0;
  return { emit: (env) => (events.push(env), Promise.resolve({ sequence: seq++ })), events };
}

function idFactory(): () => string {
  let n = 0;
  return () => `child_${n++}`;
}

function spy(): { gateway: ModelGateway; calls: () => number } {
  const base = createFakeGateway({ mode: 'valid' });
  let calls = 0;
  return {
    gateway: { call: (r) => ((calls += 1), base.call(r)), capabilityFor: base.capabilityFor },
    calls: () => calls,
  };
}

const bounds: MutationBounds = {
  personaWeightDelta: 0.1,
  spawnBudgetDelta: 2,
  toolPermissionAllowlist: ['search', 'calc', 'web'],
};

const GEN = 'gen_1'; // the parents' generation G — both reproduction modes' children land here.

function fparent(id: string, vector: readonly number[]): FusionParent {
  const agenome: Agenome = {
    ...validAgenome,
    id,
    generationId: GEN,
    systemPrompt: `prompt ${id}`,
    personaWeights: { curiosity: 0.5 },
    toolPermissions: ['search'],
  };
  return { agenome, noveltyVector: vector };
}

function deps(gateway: ModelGateway): ReproduceDeps {
  return { gateway, emit: recorder().emit, newId: idFactory(), bounds };
}

function input(parents: readonly FusionParent[]): ReproduceInput {
  return { runId: 'run_1', generationId: GEN, eligibleParents: parents, seed: 42 };
}

/**
 * reproduce / applyReproduction (P5.10, §8/§3) — the reproduction dispatcher. Routes by distinct
 * eligible-parent count (≥2 → fusion, 1 → mutation_only, 0 → abort) and replay-dispatches by mode.
 */
describe('reproduce — dispatcher + replay-by-mode', () => {
  const A = fparent('agn_A', [1, 0, 0, 0, 0, 0, 0, 0]);
  const B = fparent('agn_B', [0, 0, 0, 0, 0, 0, 0, 1]);

  // 6 — spec(§8): ≥2 distinct parents → delegates to fuse (agenome.fused emitted).
  test('dispatch_two_or_more_to_fusion', async () => {
    const { emit, events } = recorder();
    const result = await reproduce(input([A, B]), {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
      bounds,
    });
    expect(result.zeroSurvivors).toBe(false);
    expect(events.some((e) => e.type === 'agenome.fused')).toBe(true);
  });

  // 7 — spec(§3): exactly 1 distinct → mutation_only (agenome.reproduced).
  test('dispatch_one_to_mutation_only', async () => {
    const { emit, events } = recorder();
    const result = await reproduce(input([A]), {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
      bounds,
    });
    expect(result.zeroSurvivors).toBe(false);
    if (!result.zeroSurvivors) expect(result.reproductionEvent.mode).toBe('mutation_only');
    expect(events.some((e) => e.type === 'agenome.reproduced')).toBe(true);
  });

  // 8 — spec(§3): 0 → abort + zeroSurvivors:true; no child.
  test('dispatch_zero_to_abort', async () => {
    const { emit, events } = recorder();
    const result = await reproduce(input([]), {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
      bounds,
    });
    expect(result.zeroSurvivors).toBe(true);
    expect(events.some((e) => e.type === 'reproduction_aborted_insufficient_parents')).toBe(true);
  });

  // 9 — spec(§8): the same parent id twice counts as 1 distinct → mutation_only (no self-fusion); the
  // injected gateway is NOT called on the dispatch-to-mutation_only path.
  test('distinct_parent_count_dedups', async () => {
    const { gateway, calls } = spy();
    const { emit, events } = recorder();
    const result = await reproduce(input([A, A]), { gateway, emit, newId: idFactory(), bounds });
    expect(result.zeroSurvivors).toBe(false);
    if (!result.zeroSurvivors) expect(result.reproductionEvent.mode).toBe('mutation_only');
    expect(events.some((e) => e.type === 'agenome.fused')).toBe(false);
    expect(calls()).toBe(0); // no fusion synthesis on the 1-distinct path
  });

  // 10 — KEY SAFETY RULE #7: applyReproduction reconstructs by mode (fusion→applyFusion,
  // mutation_only→applyMutation) from the persisted event, deep-equal; it takes NO gateway.
  test('replay_dispatch_by_mode_no_gateway_no_rng', async () => {
    const fusion = await reproduce(input([A, B]), deps(createFakeGateway({ mode: 'valid' })));
    expect(fusion.zeroSurvivors).toBe(false);
    if (!fusion.zeroSurvivors) {
      expect(applyReproduction([A, B], fusion.reproductionEvent)).toEqual(fusion.child);
    }
    const mut = await reproduce(input([A]), deps(createFakeGateway({ mode: 'valid' })));
    expect(mut.zeroSurvivors).toBe(false);
    if (!mut.zeroSurvivors) {
      expect(applyReproduction([A], mut.reproductionEvent)).toEqual(mut.child);
    }
  });

  // 11 — replay-faithful: same (input, seed) → identical child + event.
  test('reproduce_deterministic_given_seed', async () => {
    const a = await reproduce(input([A, B]), deps(createFakeGateway({ mode: 'valid' })));
    const b = await reproduce(input([A, B]), deps(createFakeGateway({ mode: 'valid' })));
    expect(a.zeroSurvivors).toBe(false);
    expect(b.zeroSurvivors).toBe(false);
    if (!a.zeroSurvivors && !b.zeroSurvivors) {
      expect(a.child).toEqual(b.child);
      expect(a.reproductionEvent).toEqual(b.reproductionEvent);
    }
  });

  // 12 — purity: reproduce does not mutate its inputs.
  test('reproduce_does_not_mutate_inputs', async () => {
    const inp = input([A, B]);
    const snapshot = structuredClone(inp);
    await reproduce(inp, deps(createFakeGateway({ mode: 'valid' })));
    expect(inp).toEqual(snapshot);
  });

  // 13 — cross-mode generation consistency (§3): both a fusion child and a mutation_only child land in
  // the PARENTS' generation G (== input.generationId == survivor.generationId), so the kernel/P5.11
  // gen-N+1 re-homing is uniform across modes — a future fusion→X / mutation_only→Y divergence would
  // corrupt the successor population's generation.
  test('children_land_in_parents_generation_both_modes', async () => {
    const fusion = await reproduce(input([A, B]), deps(createFakeGateway({ mode: 'valid' })));
    expect(fusion.zeroSurvivors).toBe(false);
    if (!fusion.zeroSurvivors) expect(fusion.child.generationId).toBe(GEN);
    const mut = await reproduce(input([A]), deps(createFakeGateway({ mode: 'valid' })));
    expect(mut.zeroSurvivors).toBe(false);
    if (!mut.zeroSurvivors) expect(mut.child.generationId).toBe(GEN);
  });
});
