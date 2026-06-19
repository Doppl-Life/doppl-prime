import { z } from "zod";
import { RunConfig } from "../run/run-config.js";

/**
 * Run (DOMAIN_MODEL.md §150-161, ARCHITECTURE.md §3, IMPLEMENTATION_PLAN.md
 * P0.15). Run-level state machine: configured → running → completing →
 * completed | running → stopping → stopped | running → failed | configured
 * → cancelled. Terminal states (completed/stopped/failed/cancelled) are
 * sinks; no exit allowed.
 *
 * `config` carries the immutable RunConfig snapshot the run was started
 * from (seed, caps, model profile, scoring policy version, rngSeed). The
 * field is named `config` rather than `configured` to avoid lexical
 * collision with the `configured` RunStatus value (the plan's draft said
 * "configured" — corrected here to `config` for clarity at the schema
 * boundary).
 */

export const RunStatusValues = [
  "configured",
  "running",
  "completing",
  "completed",
  "stopping",
  "stopped",
  "failed",
  "cancelled",
] as const;

export const RunStatus = z.enum(RunStatusValues);
export type RunStatus = z.infer<typeof RunStatus>;

export const TerminalRunStatusValues = ["completed", "stopped", "failed", "cancelled"] as const;
export const TerminalRunStatus = z.enum(TerminalRunStatusValues);
export type TerminalRunStatus = z.infer<typeof TerminalRunStatus>;

export const Run = z
  .object({
    id: z.string().min(1),
    status: RunStatus,
    config: RunConfig,
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    terminalSummary: z.string().optional(),
  })
  .strict();
export type Run = z.infer<typeof Run>;
