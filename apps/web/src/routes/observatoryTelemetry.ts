import type { RunEventEnvelope } from '../data/contracts';
import type { RunHealth } from '../data/health';
import type { HealthStatus, HealthSummary, TickerEvent } from '../components/ds';

/**
 * observatoryTelemetry (FV.6) — PURE event-/projection-derived selectors that shape the live-telemetry
 * panels (ActivityTicker, HealthIndicator) in the S2 Organism view. Read-only over the observatory
 * hook's `fold.events` + `health` projection (rule #9 — never mutates, never POSTs); replay-identical
 * because the selectors are pure over the persisted events (rule #7 — no provider call). Machine-truth:
 * the ticker reads type/sequence/occurredAt/actor VERBATIM (no fabricated narration); the health STATUS
 * is a CLIENT-SIDE display threshold over last-event-age — the underlying signal + the exhaustion/
 * terminal decisions stay the kernel's/API's (rule #2 projection-derived).
 */

/**
 * Map RunEvent envelopes → ticker rows, ordered by `sequence` ASCENDING (the SOLE ordering key — never
 * re-sorted by `occurredAt`). `type`/`sequence`/`occurredAt`/`actor` are read VERBATIM; ANY type yields
 * a row (the component falls back to a neutral glyph for an unmapped type), never dropped/thrown.
 * `[]` → `[]`.
 */
export function deriveTickerEvents(events: readonly RunEventEnvelope[]): TickerEvent[] {
  return [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .map((e) => ({
      sequence: e.sequence,
      type: e.type,
      actor: e.actor,
      occurredAt: e.occurredAt,
    }));
}

/**
 * Map the §11 RunHealth projection → the HealthIndicator's HealthSummary. `lastEventAgeMs` is
 * `nowMs − Date.parse(lastEventAt)` when `lastEventAt` is present AND parseable (NaN guarded → the
 * field is omitted, never NaN); `null` health → a safe empty summary (no crash, no NaN).
 */
export function toHealthSummary(health: RunHealth | null, nowMs: number): HealthSummary {
  if (health === null) return {};
  const summary: HealthSummary = {
    currentGeneration: health.currentGeneration,
    candidatesInFlight: health.candidatesInFlight,
    capsConsumed: health.capsConsumed,
  };
  if (health.lastEventAt !== null) {
    const t = Date.parse(health.lastEventAt);
    if (!Number.isNaN(t)) summary.lastEventAgeMs = Math.max(0, nowMs - t);
  }
  return summary;
}

// Display-only thresholds (ms) for the continue-vs-switch cue — TUNABLE constants, NOT contract; they
// mirror the §11 ~10-minute cockpit window. `< HEALTHY` healthy · `< SLOWING` slowing · `< SLOW` slow ·
// `< DEGRADED` degraded · `≥ DEGRADED` stalled.
const HEALTHY_MS = 3_000;
const SLOWING_MS = 8_000;
const SLOW_MS = 20_000;
const DEGRADED_MS = 60_000;

/**
 * Threshold last-event-age → a display HealthStatus. Absent age (a run not yet producing any event) →
 * `healthy` (a fresh run is NOT stalled). The underlying exhaustion/terminal decision stays the
 * kernel's — this is presentation only.
 */
export function deriveHealthStatus(summary: HealthSummary): HealthStatus {
  const age = summary.lastEventAgeMs;
  if (age === undefined) return 'healthy';
  if (age < HEALTHY_MS) return 'healthy';
  if (age < SLOWING_MS) return 'slowing';
  if (age < SLOW_MS) return 'slow';
  if (age < DEGRADED_MS) return 'degraded';
  return 'stalled';
}
