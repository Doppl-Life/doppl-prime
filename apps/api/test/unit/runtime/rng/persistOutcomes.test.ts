import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSeededRng } from '../../../../src/runtime/rng/seededRng';
import {
  createLiveOutcomeSource,
  createReplayOutcomeSource,
  type OutcomeSource,
} from '../../../../src/runtime/rng/persistOutcomes';

/**
 * P3.6 outcome-persistence bridge (ARCHITECTURE.md §4 (a)≡(b), KEY SAFETY RULE #7). LIVE draws from the
 * seeded RNG and records each concrete outcome to a JSON-safe ordered log destined for the
 * agenome.mutated / agenome.fused / lineage.culled payloads; REPLAY reads the persisted log in order and
 * NEVER constructs or advances a PRNG.
 */

const PERSIST_SRC = fileURLToPath(
  new URL('../../../../src/runtime/rng/persistOutcomes.ts', import.meta.url),
);

describe('LIVE outcome source (P3.6)', () => {
  test('live_records_outcomes_in_draw_order', () => {
    // spec(§4): §4(b) — each draw's concrete outcome is captured into an ordered, JSON-safe {label,value} log.
    const live = createLiveOutcomeSource(createSeededRng(7));
    live.float('mutation_magnitude');
    live.int('crossover_point', 0, 10);
    live.pick('parent_tiebreak', ['a', 'b', 'c']);
    const log = live.outcomes();
    expect(log.map((e) => e.label)).toEqual([
      'mutation_magnitude',
      'crossover_point',
      'parent_tiebreak',
    ]);
    // JSON-safe + stable (it rides the open-JSONB event payload unchanged).
    expect(JSON.parse(JSON.stringify(log))).toEqual(log);
    expect(log.every((e) => typeof e.value === 'number')).toBe(true);
  });
});

describe('REPLAY outcome source (P3.6)', () => {
  test('replay_returns_persisted_without_advancing_rng', () => {
    // rule #7: REPLAY returns persisted outcomes in draw order and constructs NO PRNG. Structural — the
    // module imports no seededRng/provider seam (so re-sampling on replay is impossible by construction, §30).
    const replay = createReplayOutcomeSource([
      { label: 'mutation_magnitude', value: 0.5 },
      { label: 'crossover_point', value: 3 },
    ]);
    expect(replay.float('mutation_magnitude')).toBe(0.5);
    expect(replay.int('crossover_point', 0, 10)).toBe(3);
    const src = readFileSync(PERSIST_SRC, 'utf8');
    expect(src).not.toMatch(/seededRng|createSeededRng/);
    expect(src).not.toMatch(/Math\.random/);
  });

  test('replay_throws_on_overdraw_and_label_mismatch', () => {
    // corruption is never silently re-sampled or re-sorted (mirrors ReplayIntegrityError validate-not-sort).
    const mismatched = createReplayOutcomeSource([{ label: 'a', value: 1 }]);
    expect(() => mismatched.float('wrong_label')).toThrow(); // label disagrees with persisted entry
    const overdrawn = createReplayOutcomeSource([{ label: 'a', value: 1 }]);
    expect(overdrawn.float('a')).toBe(1);
    expect(() => overdrawn.float('a')).toThrow(); // drawing past the persisted log end
  });
});

describe('pick index-semantics + bounds (P3.6)', () => {
  test('pick_records_index_not_element_replays_by_reconstruction', () => {
    // rule #7: pick records the chosen INDEX (the actual RNG outcome), NOT the element — so replay
    // reconstructs `items[index]` from the persisted index + caller-supplied items. Using a NON-JSON-safe
    // element (a function-bearing object) LOCKS why: recording the element would lose the function on
    // JSON round-trip (silent lineage divergence). The index keeps the log JSON-safe + replay-faithful.
    const sentinel = (): string => 'live-only';
    const items = [
      { id: 'a', fn: sentinel },
      { id: 'b', fn: sentinel },
      { id: 'c', fn: sentinel },
    ];
    const live = createLiveOutcomeSource(createSeededRng(11));
    const chosen = live.pick('parent_select', items);
    const log = live.outcomes();
    expect(typeof log[0]!.value).toBe('number'); // the recorded outcome is the INDEX, not the object
    expect(JSON.parse(JSON.stringify(log))).toEqual(log); // log stays JSON-safe despite non-serializable items
    const replay = createReplayOutcomeSource(log);
    expect(replay.pick('parent_select', items)).toBe(chosen); // same object reference, reconstructed by index
    expect(chosen.fn).toBe(sentinel); // the function survived — it was never serialized
  });

  test('pick_guards_bounds_live_empty_and_replay_out_of_range', () => {
    // validate-not-sort / no-silent-corruption: a persisted index out of range for the supplied items
    // throws (never returns undefined), mirroring the overdraw guard; LIVE pick on empty items throws.
    const outOfRange = createReplayOutcomeSource([{ label: 'p', value: 5 }]);
    expect(() => outOfRange.pick('p', ['only-one'])).toThrow(); // index 5 ≥ items.length 1
    const live = createLiveOutcomeSource(createSeededRng(1));
    expect(() => live.pick('empty', [])).toThrow(); // degenerate: nothing to pick from
  });
});

describe('LIVE≡REPLAY equivalence (§4 (a)≡(b)) (P3.6)', () => {
  test('live_then_replay_is_byte_identical', () => {
    // spec(§4): replay reconstructs from persisted seed/outcomes and never re-samples — a LIVE draw script
    // from seed S, whose outcomes are captured, replays byte-identically through the REPLAY source.
    const items = ['x', 'y', 'z'] as const;
    const script = (s: OutcomeSource): unknown[] => [
      s.float('m1'),
      s.int('c1', 0, 100),
      s.pick('p1', items),
      s.float('m2'),
    ];
    const live = createLiveOutcomeSource(createSeededRng(99));
    const liveSeq = script(live);
    const captured = live.outcomes();
    const replay = createReplayOutcomeSource(captured);
    const replaySeq = script(replay);
    expect(replaySeq).toEqual(liveSeq); // identical returned draw values
    expect(replay.outcomes()).toEqual(captured); // identical re-emitted outcome log
  });
});
