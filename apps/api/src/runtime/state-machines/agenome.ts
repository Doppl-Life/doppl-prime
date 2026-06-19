import type { AgenomeStatus } from "@doppl/contracts";
import { IllegalTransitionError } from "./errors.js";

/**
 * Agenome-level state machine per DOMAIN_MODEL.md §184-189. Closed
 * transition matrix:
 *
 *   seeded → active → spent → eligible_parent → reproduced
 *   active → failed
 *   active → culled
 *   eligible_parent → culled    (parent not selected for reproduction)
 *
 * Terminal: {failed, reproduced, culled}.
 */

const TRANSITIONS: ReadonlyMap<AgenomeStatus, ReadonlySet<AgenomeStatus>> = new Map([
  ["seeded", new Set<AgenomeStatus>(["active"])],
  ["active", new Set<AgenomeStatus>(["spent", "failed", "culled"])],
  ["spent", new Set<AgenomeStatus>(["eligible_parent"])],
  ["eligible_parent", new Set<AgenomeStatus>(["reproduced", "culled"])],
  // Terminal sinks.
  ["failed", new Set<AgenomeStatus>()],
  ["reproduced", new Set<AgenomeStatus>()],
  ["culled", new Set<AgenomeStatus>()],
]);

const TERMINAL: ReadonlySet<AgenomeStatus> = new Set<AgenomeStatus>([
  "failed",
  "reproduced",
  "culled",
]);

function canTransition(from: AgenomeStatus, to: AgenomeStatus): boolean {
  const allowed = TRANSITIONS.get(from);
  return allowed?.has(to) ?? false;
}

function transition(from: AgenomeStatus, to: AgenomeStatus): AgenomeStatus {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError("Agenome", from, to);
  }
  return to;
}

function isTerminal(state: AgenomeStatus): boolean {
  return TERMINAL.has(state);
}

export const AgenomeStateMachine = {
  canTransition,
  transition,
  isTerminal,
  terminalStates: TERMINAL,
} as const;
