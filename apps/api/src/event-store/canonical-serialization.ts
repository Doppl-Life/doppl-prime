/**
 * Stable JSON serialization for state-equivalence assertions (P1.8).
 *
 * The output is a string that:
 *  - sorts object keys lexicographically at every level
 *  - preserves array order (arrays are meaningful)
 *  - normalizes `-0` to `0`
 *  - escapes strings via the JSON spec (delegated to `JSON.stringify` per
 *    string)
 *  - throws on values that are not plain JSON (`Date`, `Map`, `Set`,
 *    functions, symbols) — these have no defined canonical form
 *
 * Two values that round-trip through `JSON.stringify(JSON.parse(...))`
 * to the same shape will canonicalize to the same string here, which
 * makes it safe to compare "projection rebuilt from event log" against
 * "projection captured at run end" without false positives from key
 * order or whitespace.
 */

function canonicalizeValue(value: unknown, allowUndefined: boolean): string {
  if (value === null) return "null";

  if (value === undefined) {
    if (allowUndefined) return "";
    throw new TypeError("canonicalize: undefined is not a valid JSON value");
  }

  const t = typeof value;

  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    if (Object.is(value, -0)) return "0";
    return JSON.stringify(value);
  }
  if (t === "string") return JSON.stringify(value);

  if (t === "function") {
    throw new TypeError("canonicalize: unsupported type — function");
  }
  if (t === "symbol") {
    throw new TypeError("canonicalize: unsupported type — symbol");
  }
  if (t === "bigint") {
    throw new TypeError("canonicalize: unsupported type — bigint");
  }

  // Reject non-plain objects (Date, Map, Set, etc.) — these have no
  // single defined canonical form.
  if (value instanceof Date) {
    throw new TypeError("canonicalize: unsupported type — Date");
  }
  if (value instanceof Map) {
    throw new TypeError("canonicalize: unsupported type — Map");
  }
  if (value instanceof Set) {
    throw new TypeError("canonicalize: unsupported type — Set");
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalizeValue(v, false)).join(",")}]`;
  }

  // Plain object — sort keys, omit undefined values (matches JSON.stringify
  // semantics for object property values).
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${canonicalizeValue(v, false)}`);
  }
  return `{${parts.join(",")}}`;
}

export function canonicalize(value: unknown): string {
  return canonicalizeValue(value, true);
}
