import { describe, expect, test } from 'vitest';
import { validAgenome } from '@doppl/contracts';
import type { Agenome } from '@doppl/contracts';
import { createRng } from '../../../../src/selection/reproduction/rng';
import { crossover, reconstructCrossover } from '../../../../src/selection/reproduction/crossover';

const parentA: Agenome = {
  ...validAgenome,
  id: 'agn_A',
  systemPrompt: 'prompt A',
  personaWeights: { curiosity: 0.5, rigor: 0.3 },
  toolPermissions: ['search', 'calc'],
  decompositionPolicy: 'depth_first',
  spawnBudget: 4,
};

const parentB: Agenome = {
  ...validAgenome,
  id: 'agn_B',
  systemPrompt: 'prompt B',
  personaWeights: { boldness: 0.8, curiosity: 0.9 },
  toolPermissions: ['web', 'python'],
  decompositionPolicy: 'breadth_first',
  spawnBudget: 2,
};

/**
 * crossover (P5.9, §8) — deterministic agenome-level trait splice of two parents at seeded
 * crossoverPoints. The persisted crossoverPoints + choices fully reconstruct the child traits (rule #7);
 * pure over the parents (no mutation). systemPrompt is NOT spliced here — it is the output-synthesis
 * result (fuse.ts).
 */
describe('crossover — deterministic agenome-level trait splice', () => {
  // 5 — spec(§8): child traits are a deterministic splice of the parents; crossoverPoints recorded.
  test('crossover_splices_traits_at_points', () => {
    const { childTraits, crossoverPoints, choices } = crossover(parentA, parentB, createRng(42));
    // personaWeights keys = union of both parents (canonical).
    expect(Object.keys(childTraits.personaWeights).sort()).toEqual(
      ['boldness', 'curiosity', 'rigor'].sort(),
    );
    // toolPermissions ⊆ the canonical union of both parents' tools.
    const union = new Set(['search', 'calc', 'web', 'python']);
    for (const t of childTraits.toolPermissions) expect(union.has(t)).toBe(true);
    expect(childTraits.toolPermissions.length).toBeGreaterThan(0);
    // decompositionPolicy + spawnBudget each chosen from one parent.
    expect([parentA.decompositionPolicy, parentB.decompositionPolicy]).toContain(
      childTraits.decompositionPolicy,
    );
    expect([parentA.spawnBudget, parentB.spawnBudget]).toContain(childTraits.spawnBudget);
    expect(crossoverPoints).toHaveLength(2);
    for (const p of crossoverPoints) expect(Number.isInteger(p)).toBe(true);
    expect(typeof choices.decompositionPolicy_from).toBe('string');
  });

  // 6 — rule #7: reconstructCrossover from the persisted crossoverPoints + choices (NO rng) yields the
  // identical child traits.
  test('crossover_points_reconstruct', () => {
    const { childTraits, crossoverPoints, choices } = crossover(parentA, parentB, createRng(42));
    const replayed = reconstructCrossover(parentA, parentB, crossoverPoints, choices);
    expect(replayed).toEqual(childTraits);
  });

  // 7 — replay-faithful: same (parents, seed) → identical traits + points + choices.
  test('crossover_deterministic_seeded', () => {
    const a = crossover(parentA, parentB, createRng(7));
    const b = crossover(parentA, parentB, createRng(7));
    expect(a.childTraits).toEqual(b.childTraits);
    expect(a.crossoverPoints).toEqual(b.crossoverPoints);
    expect(a.choices).toEqual(b.choices);
  });

  // 8 — purity: crossover does not mutate its parents.
  test('crossover_does_not_mutate_parents', () => {
    const snapA = structuredClone(parentA);
    const snapB = structuredClone(parentB);
    crossover(parentA, parentB, createRng(42));
    expect(parentA).toEqual(snapA);
    expect(parentB).toEqual(snapB);
  });
});
