// P0.9 — EnergyEvent: a SUCCESS-ONLY productive-spend record (ARCHITECTURE.md §4/§5). SAFETY slice
// (rule #8 — energy = successful productive spend only). spec(§5): failed/retried/repaired attempts
// do NOT debit energy — they are a SEPARATE `provider_call_failed` event. So EnergyEvent carries no
// failure/retry/success field (unrepresentable by shape, lesson §9) and persists BOTH the pre-call
// `estimate` and the post-call reconciled `actual`. Counts/ranges (nonnegativity) are kernel (§6).
import { describe, it, expect } from 'vitest';
import { EnergyEvent, EnergyEventType, ProviderMeta } from '@doppl/contracts';

const validProviderMeta = {
  provider: 'openrouter',
  modelId: 'anthropic/claude-3.5',
  gatewayRequestId: 'greq_1',
  tokensIn: 1200,
  tokensOut: 380,
  costEstimate: 0.004,
};

const validEnergy = {
  id: 'enr_1',
  runId: 'run_1',
  generationId: 'gen_1',
  agenomeId: 'agn_1',
  eventType: 'llm',
  estimate: 100,
  actual: 95,
  unit: 'doppl_energy',
  reason: 'idea_generation_completed',
  providerMeta: validProviderMeta,
};

const REQUIRED_KEYS = ['id', 'runId', 'eventType', 'estimate', 'actual', 'unit', 'reason'] as const;
const EVENT_TYPES = ['llm', 'tool', 'spawn'] as const;

describe('EnergyEvent — success-only productive spend (spec §4/§5)', () => {
  it('energy_event_accepts_valid_and_strict', () => {
    // spec(§4/§5): positive guard first (lesson §10) — full event round-trips; a minimal event
    // (none of the 3 optionals: generationId/agenomeId/providerMeta) parses; unknown rejected;
    // each required field mandatory.
    expect(EnergyEvent.parse(validEnergy)).toEqual(validEnergy);
    const minimal = {
      id: 'enr_2',
      runId: 'run_1',
      eventType: 'tool',
      estimate: 10,
      actual: 10,
      unit: 'doppl_energy',
      reason: 'web_search_call',
    };
    expect(EnergyEvent.parse(minimal)).toEqual(minimal);
    expect(() => EnergyEvent.parse({ ...validEnergy, bogus: 1 })).toThrow();
    for (const k of REQUIRED_KEYS) {
      const clone: Record<string, unknown> = { ...validEnergy };
      delete clone[k];
      expect(() => EnergyEvent.parse(clone), `missing ${k}`).toThrow();
    }
    expect(REQUIRED_KEYS).toHaveLength(7);
  });

  it('energy_eventType_closed_3_union', () => {
    // spec(§4): eventType is the closed 3-member union; crucially there is NO failure type — failed
    // attempts are a separate `provider_call_failed` event, never an energy.spent.
    for (const t of EVENT_TYPES) {
      expect(EnergyEventType.parse(t)).toBe(t);
      expect(EnergyEvent.parse({ ...validEnergy, eventType: t }).eventType).toBe(t);
    }
    expect(EVENT_TYPES).toHaveLength(3);
    expect(() => EnergyEventType.parse('failed')).toThrow();
    expect(() => EnergyEventType.parse('embedding')).toThrow();
    expect(() => EnergyEventType.parse('')).toThrow();
    expect(() => EnergyEvent.parse({ ...validEnergy, eventType: 'failed' })).toThrow();
  });

  it('energy_no_failed_debit_field', () => {
    // spec(§4, rule #8): energy models ONLY successful spend — a failure/retry/repair/success debit
    // field is structurally unrepresentable (strictObject rejects it), and BOTH estimate and actual
    // are required (pre-call estimate + post-call reconciled actual).
    // Positive guard first (lesson §10): the schema EXISTS and accepts the valid event — so the
    // rejections below fire because strictObject rejects the extra field, not a missing export.
    expect(EnergyEvent.parse(validEnergy)).toEqual(validEnergy);
    for (const field of ['failed', 'retried', 'repaired', 'success']) {
      expect(
        () => EnergyEvent.parse({ ...validEnergy, [field]: field === 'retried' ? 1 : true }),
        `debit field ${field}`,
      ).toThrow();
    }
    for (const amt of ['estimate', 'actual'] as const) {
      const clone: Record<string, unknown> = { ...validEnergy };
      delete clone[amt];
      expect(() => EnergyEvent.parse(clone), `missing ${amt}`).toThrow();
    }
  });

  it('energy_unit_and_amounts', () => {
    // spec(§4): unit is fixed to `doppl_energy` (the unit shared with RunCaps.energyBudget); any other
    // value rejected. estimate/actual are integers (doppl_energy is integer); a non-int is rejected.
    expect(EnergyEvent.parse(validEnergy).unit).toBe('doppl_energy');
    expect(() => EnergyEvent.parse({ ...validEnergy, unit: 'tokens' })).toThrow();
    expect(() => EnergyEvent.parse({ ...validEnergy, unit: '' })).toThrow();
    expect(() => EnergyEvent.parse({ ...validEnergy, estimate: 1.5 })).toThrow();
    expect(() => EnergyEvent.parse({ ...validEnergy, actual: 2.7 })).toThrow();
    expect(() => EnergyEvent.parse({ ...validEnergy, reason: '' })).toThrow();
  });

  it('energy_providerMeta', () => {
    // spec(§6): providerMeta is optional; when present it is the shared ProviderMeta shape (Q1 — also
    // imported by P0.12). NO secret field — credentials load from env only (§14).
    const noMeta: Record<string, unknown> = { ...validEnergy };
    delete noMeta.providerMeta;
    expect(EnergyEvent.parse(noMeta)).toEqual(noMeta);
    // the shared shape parses directly and within EnergyEvent; costEstimate is optional.
    expect(ProviderMeta.parse(validProviderMeta)).toEqual(validProviderMeta);
    const noCost: Record<string, unknown> = { ...validProviderMeta };
    delete noCost.costEstimate;
    expect(ProviderMeta.parse(noCost)).toEqual(noCost);
    // malformed providerMeta is rejected (missing required field + unknown field + bad token type).
    expect(() => EnergyEvent.parse({ ...validEnergy, providerMeta: { provider: 'x' } })).toThrow();
    expect(() =>
      EnergyEvent.parse({ ...validEnergy, providerMeta: { ...validProviderMeta, secret: 'sk-x' } }),
    ).toThrow();
    expect(() =>
      EnergyEvent.parse({ ...validEnergy, providerMeta: { ...validProviderMeta, tokensIn: -5 } }),
    ).toThrow();
  });
});
