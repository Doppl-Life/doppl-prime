import type { RunEventType, RunStatus } from '@doppl/contracts';
import {
  planKillSwitch,
  type GenerationRef,
  type KillPlanSummary,
  type KillTrigger,
} from '../caps/killSwitch';
import { canTransitionRun } from '../state/runStateMachine';
import { canTransitionGeneration } from '../state/generationStateMachine';

/**
 * P3.10e — the loop's KILL/ABORT execution (ARCHITECTURE.md §5, KEY SAFETY RULE #1). The P3.4 kill switch
 * (`planKillSwitch`) is the pure DECISION; this is its FIRST production caller + the executor.
 */

/** The kernel-owned append the loop provides to the kill path (correlation optional — run-level default). */
export type KillAppend = (
  type: RunEventType,
  payload: Record<string, unknown>,
  correlation?: { generationId?: string; agenomeId?: string; candidateId?: string },
) => Promise<unknown>;

/**
 * Execute a kill: plan via `planKillSwitch` then EXECUTE it through the append path.
 *
 * 1. `planKillSwitch` maps the run + each non-terminal generation to its §3-LEGAL terminal (guard-validated
 *    internally — only legal transitions are included), incl. the kernel-026 sv5 names `run.cancelled` /
 *    `generation.skipped`. Append every named terminal (rule #2 — every kill decision is a persisted event).
 * 2. DRAIN-then-terminalize the kill-EXCLUDED states (the ones the plan returns no edge for because they're
 *    already-terminalizing / transient): `completing→completed`, `stopping→stopped`, `degraded→verifying→
 *    failed` — each guard-validated. So EVERY non-terminal reaches terminal under the kill (the §H invariant).
 *
 * LATCHING: the drain runs UNDER the still-active kill — a drained `degraded` goes `verifying→failed`, never
 * re-arming into new productive verify/score/reproduce work. Returns the partial `KillPlanSummary` (the kill
 * evidence; the run-terminal VERDICT is P3.11, not here). Decides + emits only — the caller owns scheduling.
 */
export async function executeKillAndDrain(
  trigger: KillTrigger,
  runStatus: RunStatus,
  generations: readonly GenerationRef[],
  append: KillAppend,
): Promise<KillPlanSummary> {
  const plan = planKillSwitch(trigger, runStatus, generations);

  // 1. Execute the plan's killable transitions (planKillSwitch includes only §3-legal, guard-validated ones).
  if (plan.run !== null && plan.run.terminalEvent !== null) {
    await append(plan.run.terminalEvent, {
      from: plan.run.from,
      to: plan.run.to,
      reason: plan.reason,
    });
  }
  for (const gen of plan.generations) {
    if (gen.terminalEvent !== null) {
      await append(
        gen.terminalEvent,
        { generationId: gen.id, from: gen.from, to: gen.to, reason: plan.reason },
        { generationId: gen.id },
      );
    }
  }

  // 2. DRAIN the kill-EXCLUDED states to terminal (guard-validated before append). The plan returns no edge
  //    for these (already-terminalizing run / transient degraded generation) — terminalize them so no
  //    non-terminal is stranded. Under the latch: `degraded` drains `verifying→failed` (no re-arm).
  if (runStatus === 'completing' && canTransitionRun('completing', 'completed').allowed) {
    await append('run.completed', { from: 'completing', to: 'completed', reason: plan.reason });
  } else if (runStatus === 'stopping' && canTransitionRun('stopping', 'stopped').allowed) {
    await append('run.stopped', { from: 'stopping', to: 'stopped', reason: plan.reason });
  }
  for (const gen of generations) {
    if (
      gen.status === 'degraded' &&
      canTransitionGeneration('degraded', 'verifying').allowed &&
      canTransitionGeneration('verifying', 'failed').allowed
    ) {
      await append(
        'generation.verifying',
        { generationId: gen.id, draining: true },
        { generationId: gen.id },
      );
      await append(
        'generation_failed',
        { generationId: gen.id, from: 'verifying', to: 'failed', reason: plan.reason },
        { generationId: gen.id },
      );
    }
  }

  return plan.partialSummary;
}
