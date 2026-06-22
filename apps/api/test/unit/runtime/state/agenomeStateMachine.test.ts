import { describe, expect, test } from 'vitest';
import type { AgenomeStatus } from '@doppl/contracts';
import { canTransitionAgenome } from '../../../../src/runtime/state/agenomeStateMachine';

/**
 * P3.2 Agenome state machine (ARCHITECTURE.md §3). Terminal = {failed, reproduced, culled}. The
 * energy-spending status is `active`; no transition from spent|failed|culled re-enters it (rule
 * #8-adjacent — no energy spend after an agenome is spent/failed/culled). Pure guard.
 */

const LEGAL: ReadonlyArray<[AgenomeStatus, AgenomeStatus]> = [
  ['seeded', 'active'],
  ['active', 'spent'],
  ['active', 'failed'],
  ['spent', 'eligible_parent'],
  ['eligible_parent', 'reproduced'],
  ['eligible_parent', 'culled'],
];
const TERMINALS: readonly AgenomeStatus[] = ['failed', 'reproduced', 'culled'];

describe('canTransitionAgenome — §3 agenome lifecycle', () => {
  test('agenome_accepts_every_legal_transition', () => {
    for (const [from, to] of LEGAL) {
      expect(canTransitionAgenome(from, to), `${from}->${to}`).toEqual({ allowed: true });
    }
  });

  test('agenome_rejects_illegal_transition', () => {
    expect(canTransitionAgenome('seeded', 'active').allowed).toBe(true); // positive guard
    expect(canTransitionAgenome('seeded', 'eligible_parent')).toEqual({
      allowed: false,
      reason: 'illegal_transition',
      from: 'seeded',
      to: 'eligible_parent',
    });
  });

  test('agenome_no_exit_from_terminal', () => {
    const ALL: readonly AgenomeStatus[] = [
      'seeded',
      'active',
      'spent',
      'eligible_parent',
      'failed',
      'reproduced',
      'culled',
    ];
    for (const from of TERMINALS) {
      for (const to of ALL) {
        const d = canTransitionAgenome(from, to);
        expect(d.allowed, `${from}->${to}`).toBe(false);
        if (!d.allowed) expect(d.reason).toBe('from_terminal');
      }
    }
  });

  // spec(rule #8-adjacent) — NO re-entry to the energy-spending status `active` from spent|failed|culled.
  test('agenome_no_energy_spend_reentry', () => {
    expect(canTransitionAgenome('active', 'spent').allowed).toBe(true); // positive guard
    expect(canTransitionAgenome('spent', 'active').allowed).toBe(false);
    expect(canTransitionAgenome('failed', 'active').allowed).toBe(false);
    expect(canTransitionAgenome('culled', 'active').allowed).toBe(false);
  });

  // spec(§3 / lesson §6) — spent→eligible_parent is a valid SHAPE; the fitness-score precondition is a
  // P3.10 kernel gate, NOT this pure (from,to) guard.
  test('agenome_spent_to_eligible_parent_allowed', () => {
    expect(canTransitionAgenome('spent', 'eligible_parent')).toEqual({ allowed: true });
  });

  // spec(P3.2) — guards are pure: same (from,to) twice → equal decision.
  test('guards_are_pure', () => {
    expect(canTransitionAgenome('active', 'spent')).toEqual(
      canTransitionAgenome('active', 'spent'),
    );
    expect(canTransitionAgenome('spent', 'active')).toEqual(
      canTransitionAgenome('spent', 'active'),
    );
  });
});
