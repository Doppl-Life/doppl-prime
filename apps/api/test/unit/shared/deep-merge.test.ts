import { describe, expect, test } from 'vitest';
import { deepMerge } from '../../../src/shared/deep-merge';

/**
 * P3.1 shared `deepMerge` (LESSON 4 / LESSON 27 single-source). The `defaults < file < env` merge
 * discipline: deep-merge plain objects, REPLACE arrays + scalars, SKIP `__proto__`/`constructor`/
 * `prototype` (pollution-safe). Single-sourced here at the 2nd in-track consumer (boot-config); the
 * P2.2 model-gateway registry re-points to it (behavior-identical).
 */

describe('deepMerge — deep objects, replace arrays/scalars, pollution-safe', () => {
  // spec(§4) — nested plain objects merge field-by-field (an override of one key keeps its siblings).
  test('shared_deep_merge_nested_objects_merge', () => {
    const merged = deepMerge({ caps: { a: 1, b: 2 } }, { caps: { b: 9 } });
    expect(merged).toEqual({ caps: { a: 1, b: 9 } });
  });

  // spec(§4) — arrays + scalars from the override REPLACE wholesale (never concatenated/merged).
  test('shared_deep_merge_replaces_arrays_and_scalars', () => {
    expect(deepMerge({ xs: [1, 2, 3], n: 1 }, { xs: [9], n: 2 })).toEqual({ xs: [9], n: 2 });
  });

  // spec(§4) — JS-internal / prototype-polluting keys are SKIPPED (pollution-safe).
  test('shared_deep_merge_pollution_safe', () => {
    const merged = deepMerge({ safe: 1 }, JSON.parse('{"__proto__":{"polluted":true},"safe":2}'));
    expect(merged.safe).toBe(2);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined(); // no prototype pollution
    expect(Object.prototype.hasOwnProperty.call(merged, '__proto__')).toBe(false);
  });

  // spec(§4) — the base is not mutated (returns a new object); precedence is left-base < right-override.
  test('shared_deep_merge_does_not_mutate_base', () => {
    const base = { a: { x: 1 } };
    const merged = deepMerge(base, { a: { y: 2 } });
    expect(merged).toEqual({ a: { x: 1, y: 2 } });
    expect(base).toEqual({ a: { x: 1 } }); // base untouched
  });
});
