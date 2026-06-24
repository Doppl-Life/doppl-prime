import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { validAgenome } from '@doppl/contracts';
import type { Agenome, RunEventEnvelope } from '@doppl/contracts';
import { createFakeGateway } from '../../../src/model-gateway';
import type { ModelGateway } from '../../../src/model-gateway';
import type { MutationBounds } from '../../../src/selection/reproduction/mutate';
import { applyReproduction } from '../../../src/selection/reproduction/reproduce';
import { allocate } from '../../../src/selection/allocation';
import { assembleSuccessor } from '../../../src/selection/successor';
import type {
  SuccessorDeps,
  SuccessorInput,
  SuccessorParent,
} from '../../../src/selection/successor';

type Emitted = Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>;

function recorder(): { emit: (e: Emitted) => Promise<{ sequence: number }>; events: Emitted[] } {
  const events: Emitted[] = [];
  let seq = 0;
  return { emit: (e) => (events.push(e), Promise.resolve({ sequence: seq++ })), events };
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

function sparent(
  id: string,
  vector: readonly number[],
  fitness: number,
  novelty: number,
  energyEfficiency: number,
): SuccessorParent {
  const agenome: Agenome = {
    ...validAgenome,
    id,
    generationId: 'gen_1',
    systemPrompt: `prompt ${id}`,
    personaWeights: { curiosity: 0.5 },
    toolPermissions: ['search'],
  };
  return { agenome, noveltyVector: vector, fitness, novelty, energyEfficiency };
}

function deps(gateway: ModelGateway): SuccessorDeps {
  return { gateway, emit: recorder().emit, newId: idFactory(), bounds };
}

function input(parents: readonly SuccessorParent[], remainingPopulation = 4): SuccessorInput {
  return {
    runId: 'run_1',
    generationId: 'gen_1',
    eligibleParents: parents,
    remainingPopulation,
    seed: 42,
  };
}

const A = sparent('agn_A', [1, 0, 0, 0, 0, 0, 0, 0], 0.9, 0.8, 0.9);
const B = sparent('agn_B', [0, 0, 0, 0, 0, 0, 0, 1], 0.7, 0.6, 0.8);

/**
 * assembleSuccessor (P5.11, §8/§5) — the gen N+1 population assembler. allocate → reproduce per slot;
 * caps-clamped (rule #1), zero-eligible → empty, runtime handoff (returns the set, no kernel import),
 * replay-reconstructable (rule #7).
 */
describe('assembleSuccessor — caps-clamped successor population', () => {
  // 7 — spec(§8): produces a population whose children come from reproduce (fusion/mutation_only).
  test('successor_assembles_population_via_reproduce', async () => {
    const result = await assembleSuccessor(
      input([A, B]),
      deps(createFakeGateway({ mode: 'valid' })),
    );
    expect(result.population.length).toBeGreaterThan(0);
    for (const member of result.population) {
      expect(['fusion', 'crossover', 'mutation_only']).toContain(member.reproductionEvent.mode);
    }
  });

  // 8 — KEY SAFETY RULE #1: population size never exceeds the remaining population headroom.
  test('successor_size_within_caps', async () => {
    const result = await assembleSuccessor(
      input([A, B], 3),
      deps(createFakeGateway({ mode: 'valid' })),
    );
    expect(result.population.length).toBeLessThanOrEqual(3);
  });

  // 9 — spec(§8/§3): no eligible parents → empty successor + survivors 0; no generation.completed here.
  test('successor_zero_eligible_empty', async () => {
    const { emit, events } = recorder();
    const result = await assembleSuccessor(input([], 5), {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
      bounds,
    });
    expect(result.population).toEqual([]);
    expect(result.survivors).toBe(0);
    expect(events.some((e) => e.type === 'generation.completed')).toBe(false);
  });

  // 10 — §2.5 layering / runtime handoff: successor.ts has no IMPORT STATEMENT pulling the runtime
  // kernel (it returns the set; the runtime calls into selection, never the reverse). Checks import
  // lines, not prose (the module doc legitimately describes the handoff).
  test('successor_no_kernel_import_runtime_handoff', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../src/selection/successor.ts', import.meta.url)),
      'utf8',
    );
    expect(src).not.toMatch(/^\s*import\b[^\n]*\/runtime/m);
    expect(src).not.toMatch(/^\s*import\b[^\n]*kernel/im);
  });

  // 11 — KEY SAFETY RULE #7: the population reconstructs from each child's persisted ReproductionEvent
  // via applyReproduction, with ZERO gateway calls on the reconstruction path.
  test('successor_replay_reconstructable_no_gateway', async () => {
    const result = await assembleSuccessor(
      input([A, B]),
      deps(createFakeGateway({ mode: 'valid' })),
    );
    const { gateway, calls } = spy();
    void gateway; // applyReproduction takes no gateway — reconstruction is structurally provider-free.
    for (const member of result.population) {
      expect(applyReproduction([A, B], member.reproductionEvent)).toEqual(member.child);
    }
    expect(calls()).toBe(0);
  });

  // 12 — replay-faithful: same (input, seed) → identical population + events.
  test('successor_deterministic_given_seed', async () => {
    const a = await assembleSuccessor(input([A, B]), deps(createFakeGateway({ mode: 'valid' })));
    const b = await assembleSuccessor(input([A, B]), deps(createFakeGateway({ mode: 'valid' })));
    expect(a.population.map((m) => m.child)).toEqual(b.population.map((m) => m.child));
    expect(a.population.map((m) => m.reproductionEvent)).toEqual(
      b.population.map((m) => m.reproductionEvent),
    );
  });

  // 13 — §8 scope boundary: allocation is the MVP heuristic only. allocation.ts is pure math — it has
  // NO import statement (no learned model / gateway / state), structurally precluding a bandit/RL/
  // value-model allocation path. (Checks imports, not prose — the doc legitimately notes the deferral.)
  test('successor_learned_allocation_out_of_scope', () => {
    const alloc = readFileSync(
      fileURLToPath(new URL('../../../src/selection/allocation.ts', import.meta.url)),
      'utf8',
    );
    expect(alloc).not.toMatch(/^\s*import\b/m);
  });

  // 14 — spec(§8): the per-parent allocation DRIVES the offspring distribution — a parent allocated a_P
  // slots anchors exactly a_P children (parentAgenomeIds[0]). Pins that the heuristic reaches the
  // population (not just its size, test 8) — a switch to full-pool-per-slot would silently drop this.
  test('successor_reflects_per_parent_allocation', async () => {
    const result = await assembleSuccessor(
      input([A, B]),
      deps(createFakeGateway({ mode: 'valid' })),
    );
    const expected = allocate(
      [
        {
          agenomeId: A.agenome.id,
          fitness: A.fitness,
          novelty: A.novelty,
          energyEfficiency: A.energyEfficiency,
        },
        {
          agenomeId: B.agenome.id,
          fitness: B.fitness,
          novelty: B.novelty,
          energyEfficiency: B.energyEfficiency,
        },
      ],
      4,
    );
    for (const e of expected) {
      const anchored = result.population.filter(
        (m) => m.reproductionEvent.parentAgenomeIds[0] === e.agenomeId,
      ).length;
      expect(anchored).toBe(e.spawns);
    }
  });

  // 16 — DEFENSE-IN-DEPTH (zero-weight pool never silently goes extinct): a NON-EMPTY pool whose
  // heuristic weights are all zero (e.g. degraded novelty → novelty 0, or a zero-fitness generation)
  // must STILL produce ≥1 offspring — never a silent empty successor with no events. Without the guard
  // the allocator returns all-zero spawns → empty schedule → `assembleSuccessor` returns {[],0} emitting
  // NOTHING (the live demo-blocker: the run dies after gen 0 with no reproduction/abort event at all).
  test('successor_zero_weight_pool_still_reproduces', async () => {
    const z1 = sparent('agn_Z1', [1, 0, 0, 0, 0, 0, 0, 0], 2.0, 0, 0.019);
    const z2 = sparent('agn_Z2', [0, 0, 0, 0, 0, 0, 0, 1], 1.667, 0, 0.019);
    const result = await assembleSuccessor(
      input([z1, z2], 4),
      deps(createFakeGateway({ mode: 'valid' })),
    );
    expect(result.survivors).toBeGreaterThan(0);
    expect(result.population.length).toBeGreaterThan(0);
    expect(result.population.length).toBeLessThanOrEqual(4);
  });

  // 17 — DEFENSE-IN-DEPTH determinism: the zero-weight fallback is still replay-faithful (rule #7) — the
  // same (input, seed) reconstructs an identical population through the fallback path.
  test('successor_zero_weight_fallback_deterministic', async () => {
    const z1 = sparent('agn_Z1', [1, 0, 0, 0, 0, 0, 0, 0], 2.0, 0, 0.019);
    const z2 = sparent('agn_Z2', [0, 0, 0, 0, 0, 0, 0, 1], 1.667, 0, 0.019);
    const a = await assembleSuccessor(
      input([z1, z2], 4),
      deps(createFakeGateway({ mode: 'valid' })),
    );
    const b = await assembleSuccessor(
      input([z1, z2], 4),
      deps(createFakeGateway({ mode: 'valid' })),
    );
    expect(a.population.map((m) => m.child)).toEqual(b.population.map((m) => m.child));
    expect(a.population.map((m) => m.reproductionEvent)).toEqual(
      b.population.map((m) => m.reproductionEvent),
    );
  });

  // 15 — KEY SAFETY RULE #7 (multi-parent): a 3-parent pool exercises mostDistantPartner's argmax +
  // id-asc tie-break + the multi-parent anchor schedule — the same (input, seed) reconstructs an
  // identical population (the determinism backbone the whole successor-replay story rests on), Σ ≤ caps.
  test('successor_deterministic_multi_parent_pool', async () => {
    const C = sparent('agn_C', [0, 1, 0, 0, 0, 0, 0, 0], 0.5, 0.5, 0.5);
    const a = await assembleSuccessor(
      input([A, B, C], 5),
      deps(createFakeGateway({ mode: 'valid' })),
    );
    const b = await assembleSuccessor(
      input([A, B, C], 5),
      deps(createFakeGateway({ mode: 'valid' })),
    );
    expect(a.population.map((m) => m.child)).toEqual(b.population.map((m) => m.child));
    expect(a.population.map((m) => m.reproductionEvent)).toEqual(
      b.population.map((m) => m.reproductionEvent),
    );
    expect(a.population.length).toBeLessThanOrEqual(5);
  });
});
