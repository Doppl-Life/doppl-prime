/**
 * Canonical serialization (P1.8, ARCHITECTURE.md §4 replay-determinism).
 *
 * A deterministic, stable serialization for state-equivalence: object keys are recursively sorted,
 * ARRAY ORDER is PRESERVED (events are ordered, so array position is semantic), and primitives
 * serialize as-is. Two content-equal states with any key insertion order serialize to the SAME string,
 * so the replay check is `canonicalSerialize(rebuilt) === canonicalSerialize(captured)`. Pure.
 *
 * Fold-state contract: JSON-safe values plus `toJSON`-bearing objects (a `Date` normalizes to its ISO
 * string, like `JSON.stringify` — so two distinct instants stay distinct rather than both collapsing to
 * `{}`). A `BigInt` / circular reference throws (a fold-authoring bug, surfaced loud, never silent).
 */

/**
 * Canonicalize one slot. Mirrors JSON.stringify's per-property algorithm: apply `toJSON` EXACTLY ONCE
 * (Date -> ISO string, etc.), THEN serialize the result structurally — the result's own `toJSON` is NOT
 * re-invoked at this slot (re-entering would call `toJSON` twice and diverge from JSON.stringify, which
 * the state-equivalence check depends on). Each array element / object member is a NEW slot, so its own
 * `toJSON` is still honored via the recursion in `canonicalizeStructure`.
 */
function canonicalize(value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    const candidate = value as { toJSON?: (key?: string) => unknown };
    if (typeof candidate.toJSON === 'function') {
      return canonicalizeStructure(candidate.toJSON());
    }
  }
  return canonicalizeStructure(value);
}

/**
 * Structural canonicalization WITHOUT a toJSON check: arrays preserve order, object keys are recursively
 * sorted, primitives pass through. Children recurse through `canonicalize` (each child is its own slot).
 *
 * Produces a PURE DATA tree — function / undefined values are dropped in objects and rendered `null` in
 * arrays, exactly as `JSON.stringify` does. Dropping them is also what keeps "toJSON once per slot"
 * correct: a `toJSON`-result object can carry its own `toJSON` FUNCTION property, and if it survived into
 * the tree the final `JSON.stringify` would re-invoke it (calling toJSON twice). A pure-data tree can't.
 */
function canonicalizeStructure(value: unknown): unknown {
  if (Array.isArray(value)) {
    // JSON.stringify renders a function/undefined array element as null (position is significant).
    return value.map((el) => {
      const c = canonicalize(el);
      return c === undefined || typeof c === 'function' ? null : c;
    });
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const c = canonicalize(source[key]); // each member is its own slot (toJSON honored)
      if (c !== undefined && typeof c !== 'function') {
        sorted[key] = c; // omit function/undefined members, like JSON.stringify
      }
    }
    return sorted;
  }
  return value;
}

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
