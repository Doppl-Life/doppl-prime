import { RunCaps } from '@doppl/contracts';

/**
 * PD.4 — demo cap-override (ARCHITECTURE.md §17). A demo convenience that produces a route-acceptable
 * LOWERED {@link RunCaps} from the validated maxima: every overridden field is set to its (lower)
 * override value, every other field stays at the maximum.
 *
 * KEY SAFETY RULE #1 — caps are kernel-enforced and can never be RAISED. This helper is **defense-in-
 * depth operator-input validation, NOT a second cap authority**: it shares the EXACT `> maxima` boundary
 * with the route's `overCapField` (`apps/api/src/routes/runs.ts`) — an override strictly above a ceiling
 * is rejected (throws, naming the field), an override `== ceiling` is accepted (a no-op, not a raise).
 * The authoritative clamp remains the route + kernel; this helper merely refuses to ASK for a raise.
 */
export function applyDemoCapOverride(maxima: RunCaps, overrides: Partial<RunCaps>): RunCaps {
  const result: RunCaps = { ...maxima };
  for (const key of Object.keys(overrides) as (keyof RunCaps)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (value <= 0) {
      throw new Error(
        `demo cap override "${key}" must be a positive integer (got ${value}) — RunCaps fields are positive ints`,
      );
    }
    if (value > maxima[key]) {
      throw new Error(
        `demo cap override "${key}" (${value}) exceeds the validated maximum (${maxima[key]}) — a demo override may only LOWER caps, never raise them (key safety rule #1)`,
      );
    }
    result[key] = value;
  }
  // Emit a validated frozen-contract object — a defensive parse so a malformed `maxima` (e.g. a
  // non-integer passed by a caller) can never escape as a bogus RunCaps.
  return RunCaps.parse(result);
}
