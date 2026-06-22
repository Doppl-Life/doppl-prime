import { describe, expect, test } from 'vitest';
import { EnergyEvent, EnergyEventType, type ProviderMeta } from '@doppl/contracts';
import {
  estimateEnergy,
  reconcileEnergy,
  type EnergyDraw,
  type ReconcileInput,
} from '../../../../src/runtime/energy/estimateReconcile';
import { DEFAULT_COST_MAP } from '../../../../src/runtime/energy/costMap';

/**
 * P3.5 estimate + reconcile (ARCHITECTURE.md §4 — debited pre-call with an estimate, reconciled post-call
 * against returned provider usage; `energy.spent` persists BOTH; KEY SAFETY RULE #8 — success-only). PURE:
 * builds the frozen `EnergyEvent` payload; the loop (P3.10) appends it (applying the scrub) + emits
 * `provider_call_failed` on a failure (NO `EnergyEvent`).
 */

const SCOPE = {
  id: 'energy_1',
  runId: 'run_1',
  generationId: 'gen_1',
  agenomeId: 'agn_1',
  reason: 'llm_generation',
};
const PM: ProviderMeta = {
  provider: 'openrouter',
  modelId: 'gpt',
  gatewayRequestId: 'req_1',
  tokensIn: 600,
  tokensOut: 900,
};

describe('estimateReconcile (P3.5 — estimate + actual, rule #8)', () => {
  test('reconcile_persists_estimate_and_actual', () => {
    // spec(§4): llm — pre-call estimate (expected tokens→energy) + post-call actual (tokensIn+tokensOut→
    // energy) BOTH on the event; both integers.
    const draw: EnergyDraw = { eventType: 'llm', expectedTokens: 1000 };
    const estimate = estimateEnergy(draw, DEFAULT_COST_MAP);
    expect(estimate).toBe(1); // ceil(1000/1000)
    const ev = reconcileEnergy(
      { scope: SCOPE, eventType: 'llm', estimate, providerMeta: PM },
      DEFAULT_COST_MAP,
    );
    expect(ev.estimate).toBe(1);
    expect(ev.actual).toBe(2); // ceil((600+900)/1000) = ceil(1.5)
    expect(Number.isInteger(ev.estimate) && Number.isInteger(ev.actual)).toBe(true);
  });

  test('reconcile_builds_valid_energy_event', () => {
    // spec(P0.9): the produced object round-trips the FROZEN EnergyEvent (eventType/unit/scope/providerMeta).
    const ev = reconcileEnergy(
      { scope: SCOPE, eventType: 'llm', estimate: 1, providerMeta: PM },
      DEFAULT_COST_MAP,
    );
    expect(EnergyEvent.parse(ev)).toEqual(ev); // parses against the frozen contract
    expect(ev.unit).toBe('doppl_energy');
    expect(ev.eventType).toBe('llm');
    expect(ev.providerMeta).toEqual(PM);
  });

  test('tool_and_spawn_estimate_equals_actual', () => {
    // spec(§4): flat per-event cost — no token variance → actual === estimate (no providerMeta needed).
    const tool = reconcileEnergy(
      { scope: { ...SCOPE, reason: 'tool_call' }, eventType: 'tool', estimate: estimateEnergy({ eventType: 'tool' }, DEFAULT_COST_MAP) },
      DEFAULT_COST_MAP,
    );
    expect(tool.estimate).toBe(5);
    expect(tool.actual).toBe(5);
    expect(EnergyEvent.parse(tool)).toEqual(tool);

    const spawn = reconcileEnergy(
      { scope: { ...SCOPE, reason: 'spawn' }, eventType: 'spawn', estimate: estimateEnergy({ eventType: 'spawn' }, DEFAULT_COST_MAP) },
      DEFAULT_COST_MAP,
    );
    expect(spawn.estimate).toBe(50);
    expect(spawn.actual).toBe(50);
  });

  test('llm_reconcile_requires_provider_meta', () => {
    // rule #8 fidelity: a successful llm call ALWAYS carries ProviderMeta (tokensIn/tokensOut are REQUIRED
    // nonnegative ints — unknown counts are 0, never absent). A missing PM is a CALLER bug, NOT a normal
    // edge — never a silent `actual=estimate` fallback (that would feed an estimate into the cap-relevant
    // cumulative). Required STRUCTURALLY (compile-time) + fails loud at runtime on a type-bypassed call
    // (lesson §31 — fail-loud, never silently wrong).
    expect(() => {
      // @ts-expect-error — the llm reconcile input REQUIRES `providerMeta` (structural rule-#8 pin)
      reconcileEnergy({ scope: SCOPE, eventType: 'llm', estimate: 1 }, DEFAULT_COST_MAP);
    }).toThrow();
    // tool/spawn legitimately carry no PM (flat cost) — not affected by the requirement.
    const toolInput: ReconcileInput = { scope: SCOPE, eventType: 'tool', estimate: 5 };
    expect(reconcileEnergy(toolInput, DEFAULT_COST_MAP).actual).toBe(5);
  });

  test('no_energy_event_for_failure_path', () => {
    // rule #8: the ONLY inputs are productive event types; the FROZEN EnergyEventType has NO failure member,
    // so a failed/retried/repaired attempt is unrepresentable as an energy debit (failures are the caller's
    // provider_call_failed). Every productive draw yields a productive-typed event — no other.
    expect(EnergyEventType.options).toEqual(['llm', 'tool', 'spawn']); // no failure member by shape
    const draws: EnergyDraw[] = [
      { eventType: 'llm', expectedTokens: 500 },
      { eventType: 'tool' },
      { eventType: 'spawn' },
    ];
    for (const draw of draws) {
      const estimate = estimateEnergy(draw, DEFAULT_COST_MAP);
      const ev =
        draw.eventType === 'llm'
          ? reconcileEnergy({ scope: SCOPE, eventType: 'llm', estimate, providerMeta: PM }, DEFAULT_COST_MAP)
          : reconcileEnergy({ scope: SCOPE, eventType: draw.eventType, estimate }, DEFAULT_COST_MAP);
      expect(['llm', 'tool', 'spawn']).toContain(ev.eventType);
    }
  });
});
