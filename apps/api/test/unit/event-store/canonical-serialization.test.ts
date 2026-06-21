import { describe, expect, test } from 'vitest';
import { canonicalSerialize } from '../../../src/event-store/canonical-serialization';

/**
 * P1.8 canonical serialization (ARCHITECTURE.md §4 replay-determinism). A deterministic, stable
 * serialization — recursive key-sort, ARRAY ORDER PRESERVED — so two content-equal states (any key
 * insertion order) serialize identically: state-equivalence is
 * `canonicalSerialize(rebuilt) === canonicalSerialize(captured)`.
 */

describe('canonicalSerialize — key-order independent, array-order significant (§4)', () => {
  // spec(§4) — two objects with the same content but different key insertion order serialize identically.
  test('canonical_serialize_key_order_independent', () => {
    const a = { total: 3, ids: ['x', 'y'], meta: { b: 2, a: 1 } };
    const b = { meta: { a: 1, b: 2 }, ids: ['x', 'y'], total: 3 };
    expect(canonicalSerialize(a)).toBe(canonicalSerialize(b));
  });

  // spec(§4) — array order is SEMANTIC (events are ordered): two arrays in different orders differ.
  test('canonical_serialize_preserves_array_order', () => {
    expect(canonicalSerialize(['a', 'b', 'c'])).not.toBe(canonicalSerialize(['c', 'b', 'a']));
    expect(canonicalSerialize({ seq: [1, 2, 3] })).not.toBe(canonicalSerialize({ seq: [3, 2, 1] }));
  });

  // spec(§4) — nested objects/arrays/primitives serialize stably + identically across calls; handles an
  // arbitrary JSONB-shaped payload.
  test('canonical_serialize_deterministic_nested', () => {
    const state = {
      z: 1,
      a: { nested: [{ k2: 'v2', k1: 'v1' }, 7], flag: true, nil: null },
      list: [3, 'two', { y: 2, x: 1 }],
    };
    const once = canonicalSerialize(state);
    const twice = canonicalSerialize(state);
    expect(once).toBe(twice);
    // key-sorted at every level (positive content guard so it fails loudly if sorting regresses)
    expect(once).toBe(
      '{"a":{"flag":true,"nested":[{"k1":"v1","k2":"v2"},7],"nil":null},"list":[3,"two",{"x":1,"y":2}],"z":1}',
    );
  });

  // spec(§4) — a Date in a fold state normalizes to its ISO string (via toJSON), NOT `{}`: two distinct
  // instants serialize differently (no false-equivalence), and a same instant is key-order independent.
  // RunEventRow.occurredAt is a Date, so a P6 projection fold may legitimately carry one.
  test('canonical_serialize_normalizes_dates_no_false_equivalence', () => {
    const a = { lastSeen: new Date('2026-06-21T00:00:00.000Z'), n: 1 };
    const b = { n: 1, lastSeen: new Date('2026-06-21T00:00:00.000Z') };
    const c = { lastSeen: new Date('2026-06-22T00:00:00.000Z'), n: 1 };
    expect(canonicalSerialize(a)).toBe(canonicalSerialize(b)); // same instant, key-order independent
    expect(canonicalSerialize(a)).not.toBe(canonicalSerialize(c)); // distinct instants stay distinct
    expect(canonicalSerialize(a)).toContain('2026-06-21T00:00:00.000Z'); // ISO, not collapsed to {}
  });
});
