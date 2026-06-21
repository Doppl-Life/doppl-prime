import { describe, expect, test } from 'vitest';
import type { AgenomeStatus } from '@doppl/contracts';
import { selectParents } from '../../../src/selection/parent-selection';
import type { SelectParentsInput } from '../../../src/selection/parent-selection';

function agenome(
  agenomeId: string,
  totals: number[],
  status: AgenomeStatus = 'eligible_parent',
): SelectParentsInput['agenomes'][number] {
  return {
    agenomeId,
    status,
    candidates: totals.map((total, i) => ({ candidateId: `${agenomeId}_c${i}`, total })),
  };
}

function input(agenomes: SelectParentsInput['agenomes'], seed = 12345): SelectParentsInput {
  return { agenomes, seed };
}

/**
 * selectParents (P5.7, §3/§8) — selects eligible parents (≥1 scored candidate, status not
 * culled/spent/failed) ranked by FitnessScore.total with a deterministic seeded tie-break (rule #7
 * replay-faithful). Zero eligible → empty set + zeroSurvivors (kernel emits generation.completed). Pure.
 */
describe('selectParents — eligible-parent ranking + seeded tie-break', () => {
  // 7 — spec(§3): only agenomes with a scored candidate are eligible; unscored excluded.
  test('parents_only_eligible_agenomes', () => {
    const { parents } = selectParents(
      input([agenome('a_scored', [0.8]), agenome('a_unscored', [])]),
      5,
    );
    expect(parents).toContain('a_scored');
    expect(parents).not.toContain('a_unscored');
  });

  // 8 — spec(§8): higher fitness is selected before lower (selection pressure).
  test('parents_ranked_by_fitness', () => {
    const { parents } = selectParents(
      input([agenome('low', [0.3]), agenome('high', [0.9]), agenome('mid', [0.6])]),
      2,
    );
    expect(parents).toEqual(['high', 'mid']);
  });

  // 9 — KEY SAFETY RULE #7: equal-fitness ties are broken via createRng(seed); same seed → identical
  // parent set; the selected ties are a subset of the tied agenomes, of the requested count.
  test('parents_tiebreak_deterministic_seeded', () => {
    const tied = [agenome('a', [0.5]), agenome('b', [0.5]), agenome('c', [0.5])];
    const a = selectParents(input(tied, 777), 2);
    const b = selectParents(input(tied, 777), 2);
    expect(a.parents).toEqual(b.parents);
    expect(a.parents).toHaveLength(2);
    for (const p of a.parents) expect(['a', 'b', 'c']).toContain(p);
  });

  // 10 — KEY SAFETY RULE #7: same (inputs, seed) reconstructs the identical full ranking on replay.
  test('parents_replay_reconstructs_same_set', () => {
    const set = [
      agenome('p', [0.5]),
      agenome('q', [0.7]),
      agenome('r', [0.5]),
      agenome('s', [0.9]),
    ];
    expect(selectParents(input(set, 42), 4).parents).toEqual(
      selectParents(input(set, 42), 4).parents,
    );
  });

  // 11 — spec(§3): zero eligible → empty parents + zeroSurvivors:true (no fabricated parents; the
  // kernel — not selection — emits generation.completed{survivors:0}).
  test('parents_zero_eligible_empty_set_flagged', () => {
    const result = selectParents(
      input([agenome('a', [], 'failed'), agenome('b', [0.9], 'culled')]),
      3,
    );
    expect(result.parents).toEqual([]);
    expect(result.zeroSurvivors).toBe(true);
  });

  // 12 — bounded: at most `count` parents are selected.
  test('parents_count_respected', () => {
    const { parents } = selectParents(
      input([agenome('a', [0.9]), agenome('b', [0.8]), agenome('c', [0.7])]),
      2,
    );
    expect(parents).toHaveLength(2);
  });

  // 13 — spec(§8): a culled agenome is never selected even if it carries a fitness score.
  test('parents_no_select_culled', () => {
    const { parents } = selectParents(
      input([agenome('a_culled', [0.95], 'culled'), agenome('a_ok', [0.4])]),
      5,
    );
    expect(parents).not.toContain('a_culled');
    expect(parents).toContain('a_ok');
  });

  // 14 — purity: selectParents does not mutate its inputs.
  test('parents_does_not_mutate_inputs', () => {
    const inp = input([agenome('a', [0.5]), agenome('b', [0.7])]);
    const snapshot = structuredClone(inp);
    selectParents(inp, 2);
    expect(inp).toEqual(snapshot);
  });

  // 15 — spec(§8): explanation enumerates the selected parents + their fitness + the tie-break basis.
  test('parents_explanation_reconstructable', () => {
    const { explanation } = selectParents(
      input([agenome('high', [0.9]), agenome('low', [0.3])]),
      2,
    );
    expect(explanation).toContain('high');
    expect(explanation).toContain('0.9');
    expect(explanation).toMatch(/tie|seed|rng/i);
  });

  // 16 — KEY SAFETY RULE #7 (replay-critical): the same eligible agenome SET in a PERMUTED input order
  // + the same seed → an IDENTICAL parent set. The canonical-sort-by-agenomeId tie-break makes selection
  // order-independent, so the replay-reader surfacing persisted fitness.scored in a different traversal
  // than the live run can't change the parent set.
  test('parents_order_independent', () => {
    const set = [
      agenome('a', [0.5]),
      agenome('b', [0.5]),
      agenome('c', [0.7]),
      agenome('d', [0.5]),
    ];
    const permuted = [set[3]!, set[1]!, set[0]!, set[2]!];
    expect(selectParents(input(set, 555), 3).parents).toEqual(
      selectParents(input(permuted, 555), 3).parents,
    );
  });
});
