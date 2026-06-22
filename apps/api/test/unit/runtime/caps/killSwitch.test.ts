import { describe, expect, test } from 'vitest';
import type { GenerationStatus, RunStatus } from '@doppl/contracts';
import { planKillSwitch } from '../../../../src/runtime/caps/killSwitch';

/**
 * P3.4 kill switch (ARCHITECTURE.md §5, KEY SAFETY RULE #1). PURE plan: operator-stop or any cap breach /
 * wall-clock maps the run + every non-terminal generation to its §3-LEGAL terminal, each transition
 * VALIDATED through the P3.2 guards (canTransitionRun/canTransitionGeneration) — never a forced illegal
 * or from-terminal transition. It emits nothing; P3.10/P3.12 append the named events + drain.
 *
 * Per-state §3 disposition (kernel-022 Step-2.5 TWEAK — NOT "everything→failed"; §5's "any non-terminal→
 * failed/stopped" does not map 1:1 onto the shipped tables). Map each non-terminal to its legal terminal;
 * a state whose only legal edge is already-terminalizing (completing→completed, stopping→stopped) or
 * transient (degraded→verifying) is EXCLUDED — it drains to terminal through its in-flight step:
 *  - RUN: configured→cancelled (operator) · running→stopping (operator) | failed (breach/wall) ·
 *    completing/stopping → EXCLUDE.
 *  - GENERATION: pending→skipped · running/verifying/scoring/reproducing→failed · degraded → EXCLUDE.
 *
 * Named events: run.stopped / run.failed / energy_exhausted (energy dim) / generation_failed. The
 * configured→cancelled + pending→skipped dispositions are STATUS-ONLY (no run.cancelled / generation-skip
 * event in the closed registry) → terminalEvent null [flagged at Step 2.5].
 */

const ACTIVE_GENS: ReadonlyArray<{ id: string; status: GenerationStatus }> = [
  { id: 'g0', status: 'completed' }, // terminal — untouched
  { id: 'g1', status: 'running' }, // → failed (legal)
  { id: 'g2', status: 'verifying' }, // → failed (legal)
];

describe('planKillSwitch (P3.4 — rule #1 kill switch, decide-only)', () => {
  test('kill_operator_stop_plans_stopped', () => {
    // spec(§5): operator-stop drives a running run toward `stopped` via the legal immediate edge
    // running→stopping (stopped follows after drain, P3.12); non-terminal gens → failed; reason + summary.
    const plan = planKillSwitch({ kind: 'operator_stop' }, 'running', ACTIVE_GENS);
    expect(plan.run).toEqual({ from: 'running', to: 'stopping', terminalEvent: 'run.stopped' });
    expect(plan.generations).toEqual([
      { id: 'g1', from: 'running', to: 'failed', terminalEvent: 'generation_failed' },
      { id: 'g2', from: 'verifying', to: 'failed', terminalEvent: 'generation_failed' },
    ]);
    expect(plan.reason.length).toBeGreaterThan(0);
    expect(plan.partialSummary).toEqual({
      reason: plan.reason,
      runFrom: 'running',
      runTo: 'stopping',
      generationsTerminated: 2,
    });
  });

  test('kill_cap_breach_plans_failed', () => {
    // spec(§5): a cap-breach / wall-clock drives a running run running→failed (legal direct terminal). An
    // ENERGY breach names `energy_exhausted`; other dimensions + wall-clock name `run.failed`. Replayable.
    const energy = planKillSwitch(
      { kind: 'cap_breach', dimension: 'energyBudget' },
      'running',
      ACTIVE_GENS,
    );
    expect(energy.run).toEqual({
      from: 'running',
      to: 'failed',
      terminalEvent: 'energy_exhausted',
    });
    const tool = planKillSwitch(
      { kind: 'cap_breach', dimension: 'maxToolCalls' },
      'running',
      ACTIVE_GENS,
    );
    expect(tool.run).toEqual({ from: 'running', to: 'failed', terminalEvent: 'run.failed' });
    const wall = planKillSwitch({ kind: 'wall_clock' }, 'running', ACTIVE_GENS);
    expect(wall.run).toEqual({ from: 'running', to: 'failed', terminalEvent: 'run.failed' });
  });

  test('kill_run_per_state_dispositions', () => {
    // spec(§3): map each run state to its legal terminal; EXCLUDE already-terminalizing/terminal states
    // (they drain through their in-flight edge). configured→cancelled is operator-only + STATUS-ONLY.
    const configured = planKillSwitch({ kind: 'operator_stop' }, 'configured', []);
    expect(configured.run).toEqual({ from: 'configured', to: 'cancelled', terminalEvent: null });
    // completing (→completed only) and stopping (→stopped only) are excluded — never mislabeled →failed.
    for (const s of ['completing', 'stopping'] as RunStatus[]) {
      expect(
        planKillSwitch({ kind: 'cap_breach', dimension: 'maxPopulation' }, s, []).run,
      ).toBeNull();
    }
    // already-terminal run → no transition (from_terminal, via the guard).
    expect(
      planKillSwitch({ kind: 'cap_breach', dimension: 'maxPopulation' }, 'failed', []).run,
    ).toBeNull();
  });

  test('kill_generation_per_state_dispositions', () => {
    // spec(§3): pending→skipped (STATUS-ONLY); active states→failed; degraded EXCLUDED (only legal edge is
    // transient degraded→verifying — it drains to verifying→failed via the loop, P3.10); terminal excluded.
    const plan = planKillSwitch({ kind: 'cap_breach', dimension: 'maxToolCalls' }, 'running', [
      { id: 'g0', status: 'completed' }, // terminal — excluded
      { id: 'g1', status: 'pending' }, // → skipped (status-only)
      { id: 'g2', status: 'degraded' }, // excluded (transient → verifying)
      { id: 'g3', status: 'scoring' }, // → failed
      { id: 'g4', status: 'reproducing' }, // → failed
    ]);
    expect(plan.generations).toEqual([
      { id: 'g1', from: 'pending', to: 'skipped', terminalEvent: null },
      { id: 'g3', from: 'scoring', to: 'failed', terminalEvent: 'generation_failed' },
      { id: 'g4', from: 'reproducing', to: 'failed', terminalEvent: 'generation_failed' },
    ]);
  });

  test('kill_plan_is_pure_and_emits_nothing', () => {
    // lesson §33/§26: same inputs → equal plan; the function returns a plan and appends/mutates/IO nothing.
    const a = planKillSwitch({ kind: 'operator_stop' }, 'running', ACTIVE_GENS);
    const b = planKillSwitch({ kind: 'operator_stop' }, 'running', ACTIVE_GENS);
    expect(a).toEqual(b);
  });
});
