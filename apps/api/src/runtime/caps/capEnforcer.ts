import type { RunCaps } from '@doppl/contracts';

/**
 * P3.4 — RunCaps enforcement (ARCHITECTURE.md §5 / §15 REQ-NF-001, KEY SAFETY RULE #1).
 *
 * Caps are enforced in the kernel, never by prompt text. `enforceCap` / `enforceWallClock` are PURE
 * fail-closed decisions: every cap dimension is checked BEFORE its bounded action proceeds, and the
 * ceilings come ONLY from the `RunCaps` argument (sourced from `RunConfig.caps`). The signature takes no
 * other input — so nothing outside the configured ceilings can raise a cap by shape (rule #1; the
 * no-extra-input structural technique, lesson §9/§11/§27). These DECIDE only: the generation loop (P3.10)
 * appends the cap-breach event on a denial (§5 ownership split — decide here, emit there; lesson §33).
 */

/** A cap dimension — one of the six frozen `RunCaps` ceilings. */
export type CapDimension = keyof RunCaps;

export interface CapAllowed {
  readonly allowed: true;
}
export interface CapDenied {
  readonly allowed: false;
  readonly reason: 'cap_exceeded';
  readonly dimension: CapDimension;
  readonly cap: number;
  readonly consumed: number;
  readonly requested: number;
}
export type CapDecision = CapAllowed | CapDenied;

/**
 * Count-dimension ceiling check. The cap is the INCLUSIVE ceiling — `consumed + requested <= cap` is
 * allowed (`=== cap` fits), `=== cap + 1` is denied. Fail-closed: a denial carries the full breach detail
 * for the loop to persist. Caps read only from the `caps` argument.
 */
export function enforceCap(
  dimension: CapDimension,
  consumed: number,
  requested: number,
  caps: RunCaps,
): CapDecision {
  const cap = caps[dimension];
  if (consumed + requested > cap) {
    return { allowed: false, reason: 'cap_exceeded', dimension, cap, consumed, requested };
  }
  return { allowed: true };
}

/**
 * Wall-clock deadline check. `elapsedMs` is INJECTED — the caller measures elapsed wall-clock time; this
 * function reads no clock (pure + deterministic, consistent with the P3.6 no-ambient-time-in-decision
 * discipline; the OUTCOME is persisted as the terminal event, replay never re-measures). The deadline is
 * EXCLUSIVE — `elapsedMs >= wallClockTimeoutMs` is denied (at the deadline you are out of time), unlike
 * the inclusive count ceilings.
 */
export function enforceWallClock(elapsedMs: number, caps: RunCaps): CapDecision {
  const cap = caps.wallClockTimeoutMs;
  if (elapsedMs >= cap) {
    return {
      allowed: false,
      reason: 'cap_exceeded',
      dimension: 'wallClockTimeoutMs',
      cap,
      consumed: elapsedMs,
      requested: 0,
    };
  }
  return { allowed: true };
}
