import type { RunEventType, RunStatus } from '@doppl/contracts';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { EventStore, RunEventRow } from '../../event-store';
import { classifyRunTerminal, runTerminalPath } from '../terminal/terminalClassifier';
import { buildPartialTerminalSummary } from '../terminal/partialSummary';
import { isRunTerminal } from '../worker/activeRunGuard';
import { stepAlreadyRecorded } from '../worker/idempotency';

/**
 * P3.13 — crash-forward recovery at boot (ARCHITECTURE.md §5 crash recovery + §3 legal terminal edges + §4
 * sequence; KEY SAFETY RULES #2/#7). On restart, BEFORE the worker accepts new work, forward-fail every
 * ORPHANED non-terminal run to its §3-LEGAL crash terminal, mapped per the LOG-observable status:
 *
 *  - running   → `run.failed{reason:"crash"}`     (reuses the P3.11 `classifyRunTerminal(crashed:true)` verdict)
 *  - configured→ `run.cancelled{reason:"crash"}`  (never-started; `configured→failed` is ILLEGAL per P3.2 —
 *                                                   `cancelled` is the only legal edge; LESSONS §48 "§5's
 *                                                   blanket →failed does NOT map 1:1").
 *
 * NEVER resumes (forward-fail only — appends ONLY the run-terminal, no generation re-execution, no
 * provider/embedding/RNG/clock — §5 "true resume deferred"). Already-terminal runs are left untouched
 * (idempotent skip via `isRunTerminal`). Deterministic over the log (PURE decision + append; same crashed
 * log ⇒ same recovery events). Each terminal is guard-validated via `runTerminalPath` (P3.2) and appended
 * through the P3.3 append path (sequence-ordered, replayable). After it runs, every run is terminal ⇒
 * P3.12's single-active-run guard starts from a clean no-active-run state. crashForward LAYERS the per-status
 * mapping on top of the P3.11 classifier; it does NOT edit it.
 */

const CRASH_REASON = 'crash';

export interface CrashForwardDeps {
  readonly eventStore: EventStore;
  /** Enumerate all run ids (injected — same pattern as P3.12; the boot caller / test supplies the impl). */
  readonly listRunIds: () => Promise<readonly string[]>;
}

export interface CrashRecovery {
  readonly runId: string;
  readonly from: RunStatus;
  readonly status: RunStatus; // 'failed' | 'cancelled'
  readonly terminalEvent: RunEventType; // 'run.failed' | 'run.cancelled'
}

export interface CrashForwardResult {
  readonly recovered: readonly CrashRecovery[];
}

/** The log-observable non-terminal status of a crashed run: running (started) vs configured (never-started). */
function crashFromStatus(log: readonly RunEventRow[]): 'running' | 'configured' | null {
  if (stepAlreadyRecorded(log, { type: 'run.started' })) return 'running';
  if (stepAlreadyRecorded(log, { type: 'run.configured' })) return 'configured';
  return null; // a run with neither marker — nothing to recover (malformed/unknown)
}

export async function crashForward(deps: CrashForwardDeps): Promise<CrashForwardResult> {
  const runIds = await deps.listRunIds();
  const recovered: CrashRecovery[] = [];

  for (const runId of runIds) {
    const log = await deps.eventStore.readByRun(runId);
    if (isRunTerminal(log)) continue; // already terminal → untouched (idempotent skip, §5)

    const from = crashFromStatus(log);
    if (from === null) continue;

    // Per-status §3-legal crash terminal (LESSONS §48 — never a blanket →failed). running reuses the P3.11
    // crash verdict (run.failed{crash}); configured maps to the only legal edge (run.cancelled{crash}).
    let status: RunStatus;
    let terminalEvent: RunEventType;
    if (from === 'running') {
      const verdict = classifyRunTerminal({ log, crashed: true });
      if (verdict.terminalEvent === null) continue; // defensive — unreachable for a non-terminal log
      status = verdict.status;
      terminalEvent = verdict.terminalEvent;
    } else {
      status = 'cancelled';
      terminalEvent = 'run.cancelled';
    }

    // Guard-validate the transition through the P3.2 run state machine — never a forced illegal transition.
    if (runTerminalPath(from, status) === null) continue; // both edges are table-legal; defensive backstop

    await deps.eventStore.append({
      id: `${runId}-crash-forward`,
      runId,
      type: terminalEvent,
      actor: 'runtime',
      payload: {
        from,
        to: status,
        reason: CRASH_REASON,
        partialSummary: buildPartialTerminalSummary(log),
      },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    recovered.push({ runId, from, status, terminalEvent });
  }

  return { recovered };
}
