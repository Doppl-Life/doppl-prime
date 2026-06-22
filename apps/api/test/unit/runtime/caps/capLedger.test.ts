import { describe, expect, test } from 'vitest';
import type { RunCaps } from '@doppl/contracts';
import { capLedger } from '../../../../src/runtime/caps/capLedger';

/**
 * P3.4 cap ledger (ARCHITECTURE.md §5 — queryable consumed-vs-remaining). PURE map over (consumed, caps)
 * the worker + `GET /runs/:id/health` read without re-deriving. Sourcing the consumed tallies (live
 * accumulation vs event-fold) is the worker's concern (P3.12), out of scope here.
 */

const CAPS: RunCaps = {
  maxPopulation: 8,
  maxGenerations: 5,
  energyBudget: 1000,
  maxSpawnDepth: 3,
  maxToolCalls: 20,
  wallClockTimeoutMs: 60_000,
};

describe('capLedger (P3.4 — queryable cap state)', () => {
  test('ledger_remaining_and_breached', () => {
    // spec(§5): remaining = max(0, cap-consumed) (never negative); breached = consumed >= cap; per
    // dimension across ALL six caps (positive headroom leads; at/over the ceiling is breached).
    const consumed = {
      maxPopulation: 3, // under
      maxGenerations: 5, // exactly at ceiling → breached, 0 remaining
      energyBudget: 1200, // over → breached, remaining clamps to 0 (never negative)
      maxSpawnDepth: 0, // unused
      maxToolCalls: 20, // at ceiling → breached
      wallClockTimeoutMs: 30_000, // under
    };
    const view = capLedger(consumed, CAPS);
    expect(view.remaining).toEqual({
      maxPopulation: 5,
      maxGenerations: 0,
      energyBudget: 0,
      maxSpawnDepth: 3,
      maxToolCalls: 0,
      wallClockTimeoutMs: 30_000,
    });
    expect(view.breached).toEqual({
      maxPopulation: false,
      maxGenerations: true,
      energyBudget: true,
      maxSpawnDepth: false,
      maxToolCalls: true,
      wallClockTimeoutMs: false,
    });
  });

  test('ledger_is_pure', () => {
    // lesson §33/§26: same (consumed, caps) → equal view; the inputs are not mutated.
    const consumed = {
      maxPopulation: 1,
      maxGenerations: 1,
      energyBudget: 1,
      maxSpawnDepth: 1,
      maxToolCalls: 1,
      wallClockTimeoutMs: 1,
    };
    const snapshot = JSON.parse(JSON.stringify(consumed));
    expect(capLedger(consumed, CAPS)).toEqual(capLedger(consumed, CAPS));
    expect(consumed).toEqual(snapshot); // inputs untouched
  });
});
