/**
 * runHealthStale (PD.6, ARCHITECTURE.md §13/§17) — the PURE continue-vs-switch staleness logic. Health
 * is stale when the last-event time is absent or older than `thresholdMs` relative to an INJECTED `nowMs`
 * (no `Date.now()` inside — the caller injects it, so the logic is deterministic + unit-testable; the
 * panel passes `now()` at render). The 3-way `healthFreshness` drives the colorblind-safe badge.
 */

/** Default staleness threshold (~10s) — beyond this with no new event, the operator should consider replay. */
export const DEFAULT_STALE_THRESHOLD_MS = 10_000;

export type HealthFreshness = 'healthy' | 'stale' | 'absent';

/**
 * Classify the run-health freshness: `absent` when there is no (or an unparseable) last-event time;
 * `stale` when the last event is older than `thresholdMs` before `nowMs`; otherwise `healthy`.
 */
export function healthFreshness(
  lastEventAt: string | null,
  nowMs: number,
  thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
): HealthFreshness {
  if (lastEventAt === null) return 'absent';
  const t = Date.parse(lastEventAt);
  if (Number.isNaN(t)) return 'absent'; // unparseable → treat as no signal (defensive, never throws)
  return nowMs - t > thresholdMs ? 'stale' : 'healthy';
}

/** True when health is absent or stale (i.e. NOT fresh) — the "consider switching to replay" cue. */
export function isStale(
  lastEventAt: string | null,
  nowMs: number,
  thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
): boolean {
  return healthFreshness(lastEventAt, nowMs, thresholdMs) !== 'healthy';
}
