import type { RunCaps } from "@doppl/contracts";

/**
 * In-flight runtime state evaluated against `RunCaps` (P3.4). Each cap is
 * checked with a single comparison; the first exhausted cap is reported
 * — callers can wire that into the appropriate terminal event
 * (`energy_exhausted`, `generation_failed`, etc.).
 *
 * `energyEstimate` is the optional pre-call estimate the gateway returns;
 * setting it lets the enforcer answer "would this call exceed the
 * budget?" without separate plumbing.
 */
export interface RunState {
  generationCount: number;
  populationCount: number;
  spawnDepth: number;
  toolCallCount: number;
  energyAccumulator: number;
  wallClockStartMs: number;
  energyEstimate?: number;
}

export type CapName =
  | "maxGenerations"
  | "maxPopulation"
  | "maxSpawnDepth"
  | "maxToolCalls"
  | "energyBudget"
  | "wallClockTimeoutMs";

export type CapEnforcementResult =
  | { ok: true }
  | { ok: false; cap: CapName; value: number; limit: number };

export interface CapEnforcer {
  enforceCaps(state: RunState): CapEnforcementResult;
}

export interface CapEnforcerOptions {
  /** Injectable clock for deterministic wall-clock tests. */
  now?: () => number;
}

export function createCapEnforcer(caps: RunCaps, options: CapEnforcerOptions = {}): CapEnforcer {
  const now = options.now ?? Date.now;

  return {
    enforceCaps(state: RunState): CapEnforcementResult {
      // Order is deterministic so the FIRST exhausted cap is the one
      // reported — callers can rely on this for terminal classification.
      if (state.generationCount >= caps.maxGenerations) {
        return {
          ok: false,
          cap: "maxGenerations",
          value: state.generationCount,
          limit: caps.maxGenerations,
        };
      }
      // Strictly-greater-than: the cap is the inclusive ceiling, so
      // populationCount === maxPopulation is allowed (the run config
      // says "at most N agenomes per generation" — exactly N must
      // still be processable). Previously `>=` rejected a fresh
      // generation whose reproduce hook produced maxPopulation
      // successors, blocking every multi-generation run cold.
      if (state.populationCount > caps.maxPopulation) {
        return {
          ok: false,
          cap: "maxPopulation",
          value: state.populationCount,
          limit: caps.maxPopulation,
        };
      }
      if (state.spawnDepth >= caps.maxSpawnDepth) {
        return {
          ok: false,
          cap: "maxSpawnDepth",
          value: state.spawnDepth,
          limit: caps.maxSpawnDepth,
        };
      }
      if (state.toolCallCount >= caps.maxToolCalls) {
        return {
          ok: false,
          cap: "maxToolCalls",
          value: state.toolCallCount,
          limit: caps.maxToolCalls,
        };
      }
      const projectedEnergy = state.energyAccumulator + (state.energyEstimate ?? 0);
      if (projectedEnergy >= caps.energyBudget) {
        return {
          ok: false,
          cap: "energyBudget",
          value: projectedEnergy,
          limit: caps.energyBudget,
        };
      }
      const elapsed = now() - state.wallClockStartMs;
      if (elapsed >= caps.wallClockTimeoutMs) {
        return {
          ok: false,
          cap: "wallClockTimeoutMs",
          value: elapsed,
          limit: caps.wallClockTimeoutMs,
        };
      }
      return { ok: true };
    },
  };
}

/**
 * Kill switch — the operator-driven termination signal the generation
 * loop checks between safe transition points. First `requestStop` call
 * wins; subsequent calls are no-ops so racing stop requests don't
 * overwrite the reason recorded for the terminal event.
 */
export interface KillSwitch {
  requestStop(reason: string): void;
  isStopped(): boolean;
  reason(): string | null;
}

export function createKillSwitch(): KillSwitch {
  let stopped = false;
  let stopReason: string | null = null;
  return {
    requestStop(r: string): void {
      if (stopped) return;
      stopped = true;
      stopReason = r;
    },
    isStopped(): boolean {
      return stopped;
    },
    reason(): string | null {
      return stopReason;
    },
  };
}
