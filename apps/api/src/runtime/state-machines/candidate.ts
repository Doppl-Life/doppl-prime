import type { CandidateStatus } from "@doppl/contracts";
import { IllegalTransitionError } from "./errors.js";

/**
 * Candidate-level state machine per DOMAIN_MODEL.md §173-180. Closed
 * transition matrix:
 *
 *   created → under_review → checked → scored → selected
 *   created → under_review → rejected
 *   created → invalid                                  (structured-output-rejected)
 *   scored → culled
 *
 * Terminal: {selected, rejected, culled, invalid}.
 *
 * **No `repairing` intermediate state**. The Phase 0 contract freeze
 * (U8 + U13) closed `CandidateStatus` at 8 values and the
 * `RunEventType` registry at 25 values — adding `repairing` would break
 * both snapshots. The gateway's pipeStructuredOutput (Phase 2 U4)
 * silently absorbs a successful repair (no event emitted), and the
 * kernel transitions `created → under_review` directly. Failed repair
 * after one retry → `created → invalid` + emits `candidate_invalidated`
 * (U6 wires this; the event type IS in the closed registry).
 */

const TRANSITIONS: ReadonlyMap<CandidateStatus, ReadonlySet<CandidateStatus>> = new Map([
  ["created", new Set<CandidateStatus>(["under_review", "invalid"])],
  ["under_review", new Set<CandidateStatus>(["checked", "rejected"])],
  ["checked", new Set<CandidateStatus>(["scored"])],
  ["scored", new Set<CandidateStatus>(["selected", "culled"])],
  // Terminal sinks.
  ["selected", new Set<CandidateStatus>()],
  ["rejected", new Set<CandidateStatus>()],
  ["culled", new Set<CandidateStatus>()],
  ["invalid", new Set<CandidateStatus>()],
]);

const TERMINAL: ReadonlySet<CandidateStatus> = new Set<CandidateStatus>([
  "selected",
  "rejected",
  "culled",
  "invalid",
]);

function canTransition(from: CandidateStatus, to: CandidateStatus): boolean {
  const allowed = TRANSITIONS.get(from);
  return allowed?.has(to) ?? false;
}

function transition(from: CandidateStatus, to: CandidateStatus): CandidateStatus {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError("Candidate", from, to);
  }
  return to;
}

function isTerminal(state: CandidateStatus): boolean {
  return TERMINAL.has(state);
}

export const CandidateStateMachine = {
  canTransition,
  transition,
  isTerminal,
  terminalStates: TERMINAL,
} as const;
