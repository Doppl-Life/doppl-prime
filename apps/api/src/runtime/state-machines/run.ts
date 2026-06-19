import type { RunStatus } from "@doppl/contracts";
import { IllegalTransitionError } from "./errors.js";

/**
 * Run-level state machine per ARCHITECTURE.md §3 and DOMAIN_MODEL.md
 * §150-161. Closed transition matrix:
 *
 *   configured → running → completing → completed
 *   configured → running → stopping → stopped
 *   configured → running → failed
 *   configured → cancelled
 *
 * Terminal states are {completed, stopped, failed, cancelled}. A run
 * cannot transition out of a terminal state — `canTransition` returns
 * false and `transition` throws `IllegalTransitionError`.
 */

const TRANSITIONS: ReadonlyMap<RunStatus, ReadonlySet<RunStatus>> = new Map([
  ["configured", new Set<RunStatus>(["running", "cancelled"])],
  ["running", new Set<RunStatus>(["completing", "stopping", "failed"])],
  ["completing", new Set<RunStatus>(["completed"])],
  ["stopping", new Set<RunStatus>(["stopped"])],
  // Terminal sinks — empty sets.
  ["completed", new Set<RunStatus>()],
  ["stopped", new Set<RunStatus>()],
  ["failed", new Set<RunStatus>()],
  ["cancelled", new Set<RunStatus>()],
]);

const TERMINAL: ReadonlySet<RunStatus> = new Set<RunStatus>([
  "completed",
  "stopped",
  "failed",
  "cancelled",
]);

function canTransition(from: RunStatus, to: RunStatus): boolean {
  const allowed = TRANSITIONS.get(from);
  return allowed?.has(to) ?? false;
}

function transition(from: RunStatus, to: RunStatus): RunStatus {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError("Run", from, to);
  }
  return to;
}

function isTerminal(state: RunStatus): boolean {
  return TERMINAL.has(state);
}

export const RunStateMachine = {
  canTransition,
  transition,
  isTerminal,
  terminalStates: TERMINAL,
} as const;
