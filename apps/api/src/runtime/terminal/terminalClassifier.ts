import type { RunEventType, RunStatus } from '@doppl/contracts';
import type { RunEventRow } from '../../event-store';
import type { KillPlanSummary } from '../caps/killSwitch';
import { canTransitionRun, RUN_TERMINALS } from '../state/runStateMachine';
import {
  bestScoredSurvivor,
  buildPartialTerminalSummary,
  type PartialTerminalSummary,
} from './partialSummary';

/**
 * P3.11 — run-terminal classification (ARCHITECTURE.md §3 terminal rule + §5 kill/crash + energy-exhaustion
 * "score already-verified", §4 terminal events, KEY SAFETY RULES #2/#7). A PURE, replay-stable decision over
 * the persisted log (no provider/store-write/clock/RNG in scope — import-ban + determinism pinned):
 *
 *  - completed iff ANY generation produced a scored survivor (`fitness.scored ∧ ¬lineage.culled`); the
 *    best-so-far survivor's candidateId is the `finalIdeaRef` recorded on `run.completed` (§3).
 *  - failed iff NO generation produced a scored survivor → `run.failed{no_scored_survivor}` (§3).
 *  - stopped/cancelled from a P3.10e operator-stop `KillPlanSummary` (§5); failed{crash} for a crash-detected
 *    non-terminal run (the P3.13 boot caller passes `crashed:true`).
 *  - `energy_exhausted` is MID-FLIGHT, NOT a run-terminal (lifecycle.ts:11-13, §5:210 "drain + score the
 *    already-verified, then the terminal event sets status") → after it the classifier still emits the REAL
 *    terminal (completed if a survivor was verified before exhaustion, else failed).
 *
 * Two layers (mirrors `planKillSwitch`/`executeKillAndDrain`): the pure decision (`classifyRunTerminal` +
 * `runTerminalPath`) here; the executor is `runGenerationLoop`'s exit (appends the single terminal event,
 * guard-validated). The kill path's REAL terminal (run.stopped/cancelled/failed) is pre-emitted by
 * `executeKillAndDrain`, so at loop exit an already-terminal run re-classifies to a NO-OP (no double-emit).
 */

export type RunTerminalStatus = 'completed' | 'failed' | 'stopped' | 'cancelled';

export interface ClassifyRunTerminalInput {
  readonly log: readonly RunEventRow[];
  /** The partial kill summary if the run was aborted by an operator-stop / cap-breach / wall-clock (P3.10e). */
  readonly killSummary?: KillPlanSummary;
  /** Set by the P3.13 boot caller for a crash-detected non-terminal run → failed{crash}. */
  readonly crashed?: boolean;
}

export interface RunTerminalVerdict {
  /** The terminal run status the verdict reaches (or the already-terminal status on a no-op). */
  readonly status: RunStatus;
  /** The single terminal event to append, or `null` when the run is already terminal (no-op — rule #2). */
  readonly terminalEvent: RunEventType | null;
  readonly reason?: string;
  readonly finalIdeaRef?: string;
  readonly partialSummary?: PartialTerminalSummary;
}

/** The killSwitch `reasonFor` value for an energyBudget breach — the mid-flight "score already-verified" case. */
const ENERGY_EXHAUSTION_REASON = 'cap_breach:energyBudget';

/** The REAL run-terminal events the loop emits in production (energy_exhausted EXCLUDED — it is mid-flight).
 * Keyed by `string` (a RunEventRow's `type` is a plain string) → returns the terminal status, or undefined. */
const RUN_TERMINAL_EVENT_STATUS: Readonly<Record<string, RunStatus>> = {
  'run.completed': 'completed',
  'run.failed': 'failed',
  'run.stopped': 'stopped',
  'run.cancelled': 'cancelled',
};

const TERMINAL_EVENT: Record<RunTerminalStatus, RunEventType> = {
  completed: 'run.completed',
  failed: 'run.failed',
  stopped: 'run.stopped',
  cancelled: 'run.cancelled',
};

/** The transient run intermediates that carry NO event (passed through; §4/Q4) on the way to a terminal. */
const TRANSIENT_INTERMEDIATES: readonly RunStatus[] = ['completing', 'stopping'];

/** The already-reached REAL run-terminal status in the log (rule #2 — at most one), or null. */
function existingRunTerminal(log: readonly RunEventRow[]): RunStatus | null {
  let terminal: RunStatus | null = null;
  for (const row of log) {
    const status = RUN_TERMINAL_EVENT_STATUS[row.type];
    if (status !== undefined) terminal = status;
  }
  return terminal;
}

/** Map a kill plan's `runTo` to the REAL terminal status it reaches (stopping→stopped); null = no mapping. */
function killTerminalStatus(runTo: RunStatus | null): RunTerminalStatus | null {
  switch (runTo) {
    case 'stopping':
    case 'stopped':
      return 'stopped';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    default:
      return null;
  }
}

function terminalVerdict(
  status: RunTerminalStatus,
  extra: {
    reason?: string;
    finalIdeaRef?: string;
    partialSummary?: PartialTerminalSummary;
  } = {},
): RunTerminalVerdict {
  return {
    status,
    terminalEvent: TERMINAL_EVENT[status],
    ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
    ...(extra.finalIdeaRef !== undefined ? { finalIdeaRef: extra.finalIdeaRef } : {}),
    ...(extra.partialSummary !== undefined ? { partialSummary: extra.partialSummary } : {}),
  };
}

/**
 * Classify the run-terminal verdict from the persisted log (PURE — reads only persisted events). Order:
 * already-terminal no-op → crash → operator/non-energy kill → the §3 scored-survivor rule (which the
 * energy-exhaustion path also lands on).
 */
export function classifyRunTerminal(input: ClassifyRunTerminalInput): RunTerminalVerdict {
  const { log, killSummary, crashed } = input;

  // 1. Already at a REAL terminal (run.completed/failed/stopped/cancelled) → no-op. The operator-stop /
  //    non-energy cap-breach / wall-clock kill path pre-emits these in `executeKillAndDrain`, so re-running
  //    the classifier at loop exit never double-emits (rule #2 immutability). energy_exhausted is excluded.
  const existing = existingRunTerminal(log);
  if (existing !== null) {
    return { status: existing, terminalEvent: null };
  }

  // 2. Crash-detected non-terminal run (P3.13 boot path) → failed{crash}.
  if (crashed === true) {
    return terminalVerdict('failed', {
      reason: 'crash',
      partialSummary: buildPartialTerminalSummary(log, killSummary),
    });
  }

  // 3. Operator-stop / non-energy kill → the forced terminal from the kill plan's `runTo`. EXCLUDE energy
  //    exhaustion: it is mid-flight (§5:210) → fall through so an energy-exhausted run can still COMPLETE.
  if (killSummary !== undefined && killSummary.reason !== ENERGY_EXHAUSTION_REASON) {
    const killStatus = killTerminalStatus(killSummary.runTo);
    if (killStatus !== null) {
      return terminalVerdict(killStatus, {
        reason: killSummary.reason,
        partialSummary: buildPartialTerminalSummary(log, killSummary),
      });
    }
  }

  // 4. The §3 scored-survivor rule — completed iff any scored survivor exists (the best-so-far is the final
  //    idea), else failed{no_scored_survivor}. The energy-exhaustion path lands here (score already-verified).
  const best = bestScoredSurvivor(log);
  if (best !== null) {
    return terminalVerdict('completed', { finalIdeaRef: best.candidateId });
  }
  return terminalVerdict('failed', {
    reason: 'no_scored_survivor',
    partialSummary: buildPartialTerminalSummary(log, killSummary),
  });
}

/**
 * The legal run-status path from the run's ACTUAL current status to a terminal, guard-validated through the
 * P3.2 `canTransitionRun` (so it is never a forced/illegal append), routing the transient completing/stopping
 * intermediate (no event, §4/Q4). Returns the ordered hops (e.g. running→completed = `['completing',
 * 'completed']`), or `null` when the terminal is unreachable — including from an already-terminal status
 * (`from_terminal`, so the executor appends nothing). The executor in `runGenerationLoop` calls this with the
 * run's current status (`running` at loop exit) before appending the verdict's terminal event.
 */
export function runTerminalPath(from: RunStatus, terminal: RunStatus): RunStatus[] | null {
  if (RUN_TERMINALS.has(from)) return null; // no exit from a terminal (P3.2 from_terminal)
  if (canTransitionRun(from, terminal).allowed) return [terminal]; // single legal hop (e.g. running→failed)
  for (const mid of TRANSIENT_INTERMEDIATES) {
    if (canTransitionRun(from, mid).allowed && canTransitionRun(mid, terminal).allowed) {
      return [mid, terminal]; // two-hop through a transient intermediate (running→completing→completed)
    }
  }
  return null; // unreachable from `from`
}
