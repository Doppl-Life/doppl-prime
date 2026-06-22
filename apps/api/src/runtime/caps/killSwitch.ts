import type { GenerationStatus, RunEventType, RunStatus } from '@doppl/contracts';
import { canTransitionRun } from '../state/runStateMachine';
import { canTransitionGeneration } from '../state/generationStateMachine';
import type { CapDimension } from './capEnforcer';

/**
 * P3.4 — the kill switch (ARCHITECTURE.md §5, KEY SAFETY RULE #1). A PURE plan: operator-stop or any cap
 * breach / wall-clock maps the run + each non-terminal generation to its §3-LEGAL terminal, every
 * transition VALIDATED through the P3.2 guards (`canTransitionRun`/`canTransitionGeneration`) as the
 * backstop — never a forced illegal or from-terminal transition. It DECIDES only and emits nothing; the
 * loop (P3.10) appends the named events + the worker (P3.12) halts scheduling + drains in-flight calls.
 *
 * Per-state §3 disposition — NOT "everything→failed" (§5's blanket phrasing does not map 1:1 onto the
 * shipped tables). Map each non-terminal to its legal terminal; a state whose only legal edge is already
 * terminalizing (`completing→completed`, `stopping→stopped`) or transient (`degraded→verifying`) is
 * EXCLUDED — it drains to terminal through its own in-flight step (P3.10), not a forced relabel:
 *  - RUN: `configured→cancelled` (operator) · `running→stopping` (operator) | `→failed` (breach/wall) ·
 *    `completing`/`stopping`/terminal → excluded.
 *  - GENERATION: `pending→skipped` · `{running,verifying,scoring,reproducing}→failed` · `degraded`/
 *    terminal → excluded.
 *
 * Named (replayable) terminal events: `run.stopped` / `run.failed` / `energy_exhausted` (energy dimension)
 * / `generation_failed`. `configured→cancelled` and `pending→skipped` are STATUS-ONLY (no `run.cancelled`
 * / generation-skip event exists in the closed registry) → `terminalEvent: null` (registry gap escalated).
 */

export type KillTrigger =
  | { readonly kind: 'operator_stop' }
  | { readonly kind: 'cap_breach'; readonly dimension: CapDimension }
  | { readonly kind: 'wall_clock' };

export interface RunTransitionPlan {
  readonly from: RunStatus;
  readonly to: RunStatus;
  readonly terminalEvent: RunEventType | null;
}
export interface GenerationTransitionPlan {
  readonly id: string;
  readonly from: GenerationStatus;
  readonly to: GenerationStatus;
  readonly terminalEvent: RunEventType | null;
}
export interface GenerationRef {
  readonly id: string;
  readonly status: GenerationStatus;
}
export interface KillPlanSummary {
  readonly reason: string;
  readonly runFrom: RunStatus;
  readonly runTo: RunStatus | null;
  readonly generationsTerminated: number;
}
export interface KillPlan {
  readonly trigger: KillTrigger;
  readonly reason: string;
  readonly run: RunTransitionPlan | null;
  readonly generations: readonly GenerationTransitionPlan[];
  readonly partialSummary: KillPlanSummary;
}

/** The §3-legal terminal target for the run (null = exclude — drain through its own edge / already terminal). */
function runTarget(trigger: KillTrigger, from: RunStatus): RunStatus | null {
  if (trigger.kind === 'operator_stop') {
    if (from === 'configured') return 'cancelled';
    if (from === 'running') return 'stopping';
    return null; // completing/stopping → drain to their own terminal; terminals → none
  }
  // cap_breach | wall_clock — a breach only occurs while the run is actually executing
  if (from === 'running') return 'failed';
  return null;
}

/** The §3-legal terminal target for a generation (null = exclude — transient/degraded or already terminal). */
function generationTarget(from: GenerationStatus): GenerationStatus | null {
  if (from === 'pending') return 'skipped';
  if (from === 'running' || from === 'verifying' || from === 'scoring' || from === 'reproducing') {
    return 'failed';
  }
  return null; // degraded (transient → verifying) or terminal
}

/** The replayable terminal event for a planned run transition (null = status-only, no registry event). */
function runEventFor(trigger: KillTrigger, to: RunStatus): RunEventType | null {
  if (to === 'stopping') return 'run.stopped'; // terminal reached after drain
  if (to === 'failed') {
    return trigger.kind === 'cap_breach' && trigger.dimension === 'energyBudget'
      ? 'energy_exhausted'
      : 'run.failed';
  }
  return null; // cancelled — no run.cancelled event in the registry (status-only)
}

function reasonFor(trigger: KillTrigger): string {
  switch (trigger.kind) {
    case 'operator_stop':
      return 'operator_stop';
    case 'wall_clock':
      return 'wall_clock_timeout';
    case 'cap_breach':
      return `cap_breach:${trigger.dimension}`;
  }
}

/**
 * Compute the kill plan. Pure: same `(trigger, runStatus, generations)` → equal plan; no emit/mutation/IO.
 * Each candidate transition is validated through the P3.2 guard — an illegal or from-terminal mapping is
 * excluded (never forced), so the plan only ever carries §3-legal transitions.
 */
export function planKillSwitch(
  trigger: KillTrigger,
  runStatus: RunStatus,
  generations: readonly GenerationRef[],
): KillPlan {
  const reason = reasonFor(trigger);

  let run: RunTransitionPlan | null = null;
  const rTarget = runTarget(trigger, runStatus);
  if (rTarget !== null && canTransitionRun(runStatus, rTarget).allowed) {
    run = { from: runStatus, to: rTarget, terminalEvent: runEventFor(trigger, rTarget) };
  }

  const generationPlans: GenerationTransitionPlan[] = [];
  for (const generation of generations) {
    const gTarget = generationTarget(generation.status);
    if (gTarget !== null && canTransitionGeneration(generation.status, gTarget).allowed) {
      generationPlans.push({
        id: generation.id,
        from: generation.status,
        to: gTarget,
        terminalEvent: gTarget === 'failed' ? 'generation_failed' : null,
      });
    }
  }

  return {
    trigger,
    reason,
    run,
    generations: generationPlans,
    partialSummary: {
      reason,
      runFrom: runStatus,
      runTo: run?.to ?? null,
      generationsTerminated: generationPlans.length,
    },
  };
}
