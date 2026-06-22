import * as React from "react";

export interface HealthSummary {
  currentGeneration?: number;
  candidatesInFlight?: number;
  lastEventAgeMs?: number;
  /** 0..1 per cap — population, generations, energy, spawnDepth, toolCalls, wallClock. */
  capsConsumed?: Record<string, number>;
}

/**
 * The operator's continue-vs-switch-to-replay gauge (GET /runs/:id/health) — the
 * one runtime read Langfuse can't give. Stalled is the cue to drop a fallback rung.
 */
export interface HealthIndicatorProps {
  health: HealthSummary;
  status?: "healthy" | "slowing" | "slow" | "degraded" | "stalled";
  showCaps?: boolean;
  mode?: "live" | "replay";
}
export function HealthIndicator(props: HealthIndicatorProps): React.JSX.Element;
