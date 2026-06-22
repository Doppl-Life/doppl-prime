import { describe, expect, test } from 'vitest';
import { Agenome } from '@doppl/contracts';
import { createRng } from '../../../../src/selection/reproduction/rng';
import { applyMutation, mutate } from '../../../../src/selection/reproduction/mutate';
import type { MutationBounds } from '../../../../src/selection/reproduction/mutate';

const parent: Agenome = {
  id: 'agn_parent',
  runId: 'run_1',
  generationId: 'gen_1',
  parentIds: [],
  systemPrompt: 'parent system prompt',
  personaWeights: { curiosity: 0.5, rigor: 0.3, boldness: 0.2 },
  toolPermissions: ['search', 'calc'],
  decompositionPolicy: 'depth_first',
  spawnBudget: 4,
  status: 'eligible_parent',
};

const bounds: MutationBounds = {
  personaWeightDelta: 0.1,
  spawnBudgetDelta: 3,
  toolPermissionAllowlist: ['search', 'calc', 'web', 'python'],
};

const fixedId = (): (() => string) => () => 'child_x';

/**
 * Bounded mutation primitive (P5.8) — live `mutate(rng)` samples + persists concrete outcomes; replay
 * `applyMutation(persisted outcomes)` reconstructs the identical child with NO rng (rule #7). Bounded +
 * finite, never raises a cap (rule #1).
 */
describe('mutate — bounded trait mutation + persisted RNG outcomes', () => {
  // 5 — spec(§8): each mutated persona weight delta is within the declared bound.
  test('mutate_personaWeights_within_bounds', () => {
    const { child, mutationSummary } = mutate(parent, createRng(42), bounds, { newId: fixedId() });
    for (const [key, weight] of Object.entries(parent.personaWeights)) {
      const delta = mutationSummary[`personaWeights.${key}`] as number;
      expect(Math.abs(delta)).toBeLessThanOrEqual(bounds.personaWeightDelta);
      expect(child.personaWeights[key] as number).toBeCloseTo(weight + delta, 12);
    }
  });

  // 6 — KEY SAFETY RULE #1: spawnBudget mutated within bounds, nonneg int, stays a hint (never raises a cap).
  test('mutate_spawnBudget_within_bounds_stays_hint', () => {
    const { child, mutationSummary } = mutate(parent, createRng(42), bounds, { newId: fixedId() });
    const delta = mutationSummary['spawnBudget'] as number;
    expect(Number.isInteger(child.spawnBudget)).toBe(true);
    expect(child.spawnBudget).toBeGreaterThanOrEqual(0);
    expect(Math.abs(delta)).toBeLessThanOrEqual(bounds.spawnBudgetDelta);
    expect(Math.abs(child.spawnBudget - parent.spawnBudget)).toBeLessThanOrEqual(
      bounds.spawnBudgetDelta,
    );
  });

  // 7 — bounded, no privilege invention: any ADDED permission comes only from the injected allowlist.
  test('mutate_toolPermissions_within_allowlist', () => {
    const { child } = mutate(parent, createRng(42), bounds, { newId: fixedId() });
    const parentSet = new Set(parent.toolPermissions);
    for (const perm of child.toolPermissions) {
      if (!parentSet.has(perm)) {
        expect(bounds.toolPermissionAllowlist).toContain(perm);
      }
    }
  });

  // 8 — spec(§8): excluded traits (systemPrompt, decompositionPolicy) are unchanged in MVP.
  test('mutate_excluded_traits_unchanged', () => {
    const { child } = mutate(parent, createRng(42), bounds, { newId: fixedId() });
    expect(child.systemPrompt).toBe(parent.systemPrompt);
    expect(child.decompositionPolicy).toBe(parent.decompositionPolicy);
  });

  // 9 — spec(§3): child records parentage + lifecycle + mutation provenance.
  test('mutate_child_records_parentage_and_meta', () => {
    const { child } = mutate(parent, createRng(42), bounds, { newId: fixedId() });
    expect(child.parentIds).toEqual(['agn_parent']);
    expect(child.status).toBe('seeded');
    expect(child.mutationMeta).toBeDefined();
    expect(child.mutationMeta?.mode).toBe('mutation');
    expect(Array.isArray(child.mutationMeta?.mutatedFields)).toBe(true);
  });

  // 10 — spec(§3): the child parses against the frozen Agenome contract (schema-valid offspring).
  test('mutate_child_validates_against_Agenome', () => {
    const { child } = mutate(parent, createRng(42), bounds, { newId: fixedId() });
    expect(() => Agenome.parse(child)).not.toThrow();
  });

  // 11 — rule #7: mutationSummary captures every applied outcome (record<string,string|number|boolean>).
  test('mutate_persists_outcomes_in_mutationSummary', () => {
    const { mutationSummary } = mutate(parent, createRng(42), bounds, { newId: fixedId() });
    for (const key of Object.keys(parent.personaWeights)) {
      expect(mutationSummary).toHaveProperty(`personaWeights.${key}`);
    }
    expect(mutationSummary).toHaveProperty('spawnBudget');
    for (const value of Object.values(mutationSummary)) {
      expect(['string', 'number', 'boolean']).toContain(typeof value);
    }
  });

  // 12 — KEY SAFETY RULE #7: applyMutation reconstructs the identical child from persisted outcomes,
  // taking NO rng (the replay path re-samples nothing).
  test('REPLAY_applyMutation_reconstructs_without_rng', () => {
    const { child, mutationSummary } = mutate(parent, createRng(42), bounds, { newId: fixedId() });
    const replayed = applyMutation(parent, mutationSummary, { newId: fixedId() });
    expect(replayed).toEqual(child);
  });

  // 12b — KEY SAFETY RULE #7 / §31: reconstruction is INVARIANT to the mutationSummary's key ORDER. The
  // persisted summary round-trips through Postgres jsonb, which does NOT preserve object key order; a
  // key-order-sensitive mutationMeta (Object.keys / JSON.stringify) makes applyMutation(persisted)
  // diverge from applyMutation(live) → breaks §31 state-equivalence for every mutated child crossing the
  // real PG round-trip. The reconstructed child (incl. mutationMeta) must be identical regardless of the
  // summary's key order. (Caught by the W2 reproduce-seam real-PG round-trip integration test.)
  test('REPLAY_applyMutation_invariant_to_summary_key_order', () => {
    const insertionOrder = mutate(parent, createRng(42), bounds, {
      newId: fixedId(),
    }).mutationSummary;
    // A jsonb-style reordering of the SAME entries (reverse the insertion order).
    const reordered: Record<string, string | number | boolean> = {};
    for (const key of Object.keys(insertionOrder).reverse()) {
      reordered[key] = insertionOrder[key]!;
    }
    const childFromInsertion = applyMutation(parent, insertionOrder, { newId: fixedId() });
    const childFromReordered = applyMutation(parent, reordered, { newId: fixedId() });
    expect(childFromReordered).toEqual(childFromInsertion);
  });

  // 13 — replay-faithful + idempotent: same (parent, seed, bounds) → identical child + summary.
  test('mutate_deterministic_given_seed', () => {
    const a = mutate(parent, createRng(7), bounds, { newId: fixedId() });
    const b = mutate(parent, createRng(7), bounds, { newId: fixedId() });
    expect(a.child).toEqual(b.child);
    expect(a.mutationSummary).toEqual(b.mutationSummary);
  });

  // 14 — spec(§8): finite mutation — across many seeds no single-application drift exceeds the bound.
  test('mutate_finite_no_unbounded_drift', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const { child } = mutate(parent, createRng(seed), bounds, { newId: fixedId() });
      for (const [key, weight] of Object.entries(parent.personaWeights)) {
        expect(Math.abs((child.personaWeights[key] as number) - weight)).toBeLessThanOrEqual(
          bounds.personaWeightDelta + 1e-12,
        );
      }
      expect(Math.abs(child.spawnBudget - parent.spawnBudget)).toBeLessThanOrEqual(
        bounds.spawnBudgetDelta,
      );
    }
  });

  // 15 — purity: mutate must NOT mutate its input parent in place (nested personaWeights/toolPermissions
  // are not shared references) — P5.9 reuses parents it also reads elsewhere.
  test('mutate_does_not_mutate_parent_in_place', () => {
    const snapshot = structuredClone(parent);
    mutate(parent, createRng(42), bounds, { newId: fixedId() });
    expect(parent).toEqual(snapshot);
  });
});
