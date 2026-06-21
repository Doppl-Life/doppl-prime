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

  // spec(§4) — toJSON is applied EXACTLY ONCE per slot (like JSON.stringify): a toJSON returning a
  // toJSON-bearing object serializes that RESULT structurally — the result's own toJSON is NOT
  // re-invoked. The buggy recursive version produced `"X"` instead of `{"b":2}`.
  test('canonicalize_calls_tojson_once_per_slot', () => {
    const v = { toJSON: () => ({ b: 2, toJSON: () => 'X' }) };
    expect(canonicalSerialize(v)).toBe(JSON.stringify(v)); // JSON.stringify-parity (positive guard)
    expect(canonicalSerialize(v)).toBe('{"b":2}'); // the outer toJSON's result, structurally
  });

  // spec(§4) — don't over-correct: a MEMBER's toJSON IS still honored (a member accessed via the parent
  // is its own slot — matches JSON.stringify). A Date member normalizes to ISO.
  test('canonicalize_member_tojson_still_honored', () => {
    const state = { at: new Date('2026-06-21T00:00:00.000Z'), tag: 'x' };
    expect(canonicalSerialize(state)).toBe(JSON.stringify(state));
    expect(canonicalSerialize(state)).toBe('{"at":"2026-06-21T00:00:00.000Z","tag":"x"}');
  });

  // spec(§4) — fold-state contract intact: a BigInt still throws loud (a fold-authoring bug, never a
  // silent wrong serialization).
  test('canonicalize_bigint_throws_regression', () => {
    expect(canonicalSerialize({ ok: 1 })).toBe('{"ok":1}'); // positive guard
    expect(() => canonicalSerialize({ big: 10n })).toThrow();
  });
});
