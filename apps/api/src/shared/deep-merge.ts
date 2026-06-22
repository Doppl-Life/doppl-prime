/**
 * Shared `defaults < file < env` deep-merge (P3.1; LESSON 4 / LESSON 27 single-source).
 *
 * Single-sourced at the 2nd in-track consumer: the boot-config loader (`runtime/config`) AND the P2.2
 * model-registry config (`model-gateway/config.schema.ts`) import this one copy. The frozen
 * `@doppl/contracts` keeps its own private copy (out-of-track to edit). Inputs are TRUSTED boot config
 * (own enumerable keys only), but JS-internal / prototype-polluting keys are skipped defensively.
 */

const DANGEROUS_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merge `override` onto `base`: nested plain objects merge field-by-field (an override of one key
 * keeps its siblings); arrays + scalars from `override` REPLACE wholesale; `__proto__`/`constructor`/
 * `prototype` keys are skipped (pollution-safe). Returns a new object — `base` is never mutated.
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const existing = result[key];
    result[key] =
      isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value;
  }
  return result;
}
