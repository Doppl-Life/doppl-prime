import { describe, expect, test } from 'vitest';
import { CriticMandate } from '@doppl/contracts';
import {
  selectCriticMandates,
  DEFAULT_ACTIVE_CRITIC_COUNT,
} from '../../../../src/verifier/council/rotation';

/**
 * P4.7 — critic-set rotation (ARCHITECTURE.md §7 critic rotation; §4 replay determinism;
 * KEY SAFETY RULE #6 judge-anchor-untouchable; RULE #7 replay-pure).
 *
 * `selectCriticMandates({ rngSeed, generationIndex, activeCount? })` is a PURE deterministic
 * closed-form selector over the closed `CriticMandate` universe. Pure function — no Postgres,
 * no event round-trip; its replay-faithfulness IS the determinism pin (test 2).
 */

const N = CriticMandate.options.length; // = 5 (closed union)

/** Membership key (order-insensitive) — "distinct set" = distinct membership, since the council
 * runs every mandate it is given, so reordering the same members is NOT a moving target. */
const membership = (set: readonly CriticMandate[]): string => [...set].sort().join(',');

describe('selectCriticMandates (P4.7 critic-set rotation)', () => {
  // spec(§7) — the active critic set is a valid, default-sized subset of the closed universe.
  test('test_returns_valid_mandate_subset_of_default_size', () => {
    // Positive guard (lesson 10): a vanished export must fail loudly, not false-pass.
    expect(typeof selectCriticMandates).toBe('function');
    expect(DEFAULT_ACTIVE_CRITIC_COUNT).toBe(3);

    const result = selectCriticMandates({ rngSeed: 12345, generationIndex: 0 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(DEFAULT_ACTIVE_CRITIC_COUNT);
    for (const mandate of result) {
      expect(CriticMandate.options).toContain(mandate);
      expect(CriticMandate.safeParse(mandate).success).toBe(true);
    }
  });

  // spec(§4)/spec(§7) — replay re-derives the identical set (members AND order); never re-sampled.
  test('test_selection_is_deterministic_for_same_inputs', () => {
    const a = selectCriticMandates({ rngSeed: 987654321, generationIndex: 4 });
    const b = selectCriticMandates({ rngSeed: 987654321, generationIndex: 4 });
    expect(a).toEqual(b); // deep-equal: same members AND same order
    // and again with an explicit activeCount
    const c = selectCriticMandates({ rngSeed: 42, generationIndex: 2, activeCount: 2 });
    const d = selectCriticMandates({ rngSeed: 42, generationIndex: 2, activeCount: 2 });
    expect(c).toEqual(d);
  });

  // spec(§7) — the verification target MOVES: not invariant across a span of generations.
  test('test_set_moves_across_generations', () => {
    const seed = 0xc0ffee;
    const sets = new Set<string>();
    for (let g = 0; g <= 6; g++) {
      sets.add(membership(selectCriticMandates({ rngSeed: seed, generationIndex: g })));
    }
    expect(sets.size).toBeGreaterThanOrEqual(2);
  });

  // spec(§7) — the persisted seed is the actual driver of selection (candidate-content cannot move it).
  test('test_seed_drives_selection', () => {
    const seedA = 111;
    const seedB = 999999;
    let foundDifference = false;
    for (let g = 0; g <= 6; g++) {
      const setA = membership(selectCriticMandates({ rngSeed: seedA, generationIndex: g }));
      const setB = membership(selectCriticMandates({ rngSeed: seedB, generationIndex: g }));
      if (setA !== setB) {
        foundDifference = true;
        break;
      }
    }
    expect(foundDifference).toBe(true);
  });

  // spec(§7) — a well-formed set: a critic never doubles (Fisher-Yates correctness).
  test('test_no_duplicate_mandates', () => {
    for (let g = 0; g <= 20; g++) {
      const result = selectCriticMandates({ rngSeed: 7 * g + 1, generationIndex: g });
      expect(new Set(result).size).toBe(result.length);
    }
  });

  // bounds safety — a tunable activeCount never under/over-runs the closed universe; clamps to [1, N].
  test('test_active_count_clamped_to_bounds', () => {
    expect(selectCriticMandates({ rngSeed: 5, generationIndex: 1, activeCount: 0 })).toHaveLength(
      1,
    );
    expect(selectCriticMandates({ rngSeed: 5, generationIndex: 1, activeCount: -7 })).toHaveLength(
      1,
    );

    const over = selectCriticMandates({ rngSeed: 5, generationIndex: 1, activeCount: 99 });
    expect(over).toHaveLength(N);
    expect([...over].sort()).toEqual([...CriticMandate.options].sort()); // set-equal to the universe

    expect(selectCriticMandates({ rngSeed: 5, generationIndex: 1, activeCount: N })).toHaveLength(
      N,
    );
  });

  // rule #6 — the held-out judge anchor is structurally untouchable: the codomain is EXACTLY the
  // CriticMandate universe — never a judge / axis / scoring / non-mandate value.
  test('test_codomain_is_critic_mandate_universe_only', () => {
    for (let s = 0; s < 50; s++) {
      for (let g = 0; g < 8; g++) {
        const result = selectCriticMandates({ rngSeed: s * 2654435761, generationIndex: g });
        for (const mandate of result) {
          expect(CriticMandate.options).toContain(mandate);
        }
      }
    }
  });
});
