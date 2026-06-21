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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize); // array order preserved
  }
  if (value !== null && typeof value === 'object') {
    // Respect `toJSON` exactly like JSON.stringify (Date -> ISO string, etc.) BEFORE treating the value
    // as a key-sortable record — otherwise a Date's empty own-key set would collapse every instant to
    // `{}`, a silent false-equivalence in the state-equivalence check.
    const candidate = value as { toJSON?: (key?: string) => unknown };
    if (typeof candidate.toJSON === 'function') {
      return canonicalize(candidate.toJSON());
    }
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
