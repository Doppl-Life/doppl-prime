import type { GenerationStatus } from "@doppl/contracts";
import { IllegalTransitionError } from "./errors.js";

/**
 * Generation-level state machine per ARCHITECTURE.md §3 and
 * DOMAIN_MODEL.md §163-171. Closed transition matrix:
 *
 *   pending → running → verifying → scoring → reproducing → completed
 *   pending → running → degraded → verifying → scoring → reproducing → completed
 *   pending → running → failed
 *   pending → skipped
 *   scoring → completed   (zero-survivors edge — no reproduction)
 *   verifying → failed
 *   scoring → failed
 *   reproducing → failed
 *
 * Terminal: {completed, failed, skipped}.
 */

const TRANSITIONS: ReadonlyMap<GenerationStatus, ReadonlySet<GenerationStatus>> = new Map([
  ["pending", new Set<GenerationStatus>(["running", "skipped"])],
  ["running", new Set<GenerationStatus>(["degraded", "verifying", "failed"])],
  ["degraded", new Set<GenerationStatus>(["verifying"])],
  ["verifying", new Set<GenerationStatus>(["scoring", "failed"])],
  // scoring → completed is the zero-survivors edge per §3.
  ["scoring", new Set<GenerationStatus>(["reproducing", "completed", "failed"])],
  ["reproducing", new Set<GenerationStatus>(["completed", "failed"])],
  // Terminal sinks.
  ["completed", new Set<GenerationStatus>()],
  ["failed", new Set<GenerationStatus>()],
  ["skipped", new Set<GenerationStatus>()],
]);

const TERMINAL: ReadonlySet<GenerationStatus> = new Set<GenerationStatus>([
  "completed",
  "failed",
  "skipped",
]);

function canTransition(from: GenerationStatus, to: GenerationStatus): boolean {
  const allowed = TRANSITIONS.get(from);
  return allowed?.has(to) ?? false;
}

function transition(from: GenerationStatus, to: GenerationStatus): GenerationStatus {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError("Generation", from, to);
  }
  return to;
}

function isTerminal(state: GenerationStatus): boolean {
  return TERMINAL.has(state);
}

export const GenerationStateMachine = {
  canTransition,
  transition,
  isTerminal,
  terminalStates: TERMINAL,
} as const;
