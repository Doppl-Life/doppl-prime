// P0.9 — §2.5 cross-track schema-snapshot gate for the energy + reproduction events. SAFETY-relevant:
// the EnergyEvent field set IS the rule-#8 no-failed-debit pin (a failure/retry field appearing here
// is a Step-9 Finding), and crossoverPoints/mutationSummary ∈ ReproductionEvent are the rule-#7
// persisted-RNG pin. spec(§4) spec(§8) spec(§2.5): all field/member sets equal frozen snapshots.
import { describe, it, expect } from 'vitest';
import {
  EnergyEvent,
  EnergyEventType,
  ReproductionEvent,
  ReproductionMode,
  ProviderMeta,
} from '@doppl/contracts';

const ENERGY_FIELD_SNAPSHOT = [
  'id',
  'runId',
  'generationId',
  'agenomeId',
  'eventType',
  'estimate',
  'actual',
  'unit',
  'reason',
  'providerMeta',
];

const ENERGY_EVENT_TYPE_SNAPSHOT = ['llm', 'tool', 'spawn'];

const REPRODUCTION_FIELD_SNAPSHOT = [
  'id',
  'runId',
  'parentAgenomeIds',
  'childAgenomeId',
  'mode',
  'crossoverPoints',
  'mutationSummary',
];

const REPRODUCTION_MODE_SNAPSHOT = ['fusion', 'crossover', 'output_synthesis', 'mutation_only'];

const PROVIDER_META_FIELD_SNAPSHOT = [
  'provider',
  'modelId',
  'gatewayRequestId',
  'tokensIn',
  'tokensOut',
  'costEstimate',
];

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('schema snapshot — EnergyEvent / ReproductionEvent / ProviderMeta (spec §4 / §8 / §2.5)', () => {
  it('barrel_exports_energy_reproduction', () => {
    // spec(§2.5): the public surface re-exports each schema + the shared ProviderMeta from one barrel.
    expect(typeof EnergyEvent.parse).toBe('function');
    expect(typeof EnergyEventType.parse).toBe('function');
    expect(typeof ReproductionEvent.parse).toBe('function');
    expect(typeof ReproductionMode.parse).toBe('function');
    expect(typeof ProviderMeta.parse).toBe('function');
  });

  it('schema_snapshot_energy_reproduction', () => {
    expect(sorted(Object.keys(EnergyEvent.shape))).toEqual(sorted(ENERGY_FIELD_SNAPSHOT));
    expect(sorted(EnergyEventType.options)).toEqual(sorted(ENERGY_EVENT_TYPE_SNAPSHOT));
    expect(sorted(Object.keys(ReproductionEvent.shape))).toEqual(sorted(REPRODUCTION_FIELD_SNAPSHOT));
    expect(sorted(ReproductionMode.options)).toEqual(sorted(REPRODUCTION_MODE_SNAPSHOT));
    expect(sorted(Object.keys(ProviderMeta.shape))).toEqual(sorted(PROVIDER_META_FIELD_SNAPSHOT));

    expect(ENERGY_FIELD_SNAPSHOT).toHaveLength(10);
    expect(ENERGY_EVENT_TYPE_SNAPSHOT).toHaveLength(3);
    expect(REPRODUCTION_FIELD_SNAPSHOT).toHaveLength(7);
    expect(REPRODUCTION_MODE_SNAPSHOT).toHaveLength(4);
    expect(PROVIDER_META_FIELD_SNAPSHOT).toHaveLength(6);

    // the safety-pin members live in their frozen sets: no failure field in EnergyEvent (rule #8),
    // and the persisted RNG outcomes in ReproductionEvent (rule #7).
    for (const failureField of ['failed', 'retried', 'repaired', 'success']) {
      expect(ENERGY_FIELD_SNAPSHOT).not.toContain(failureField);
    }
    expect(REPRODUCTION_FIELD_SNAPSHOT).toContain('crossoverPoints');
    expect(REPRODUCTION_FIELD_SNAPSHOT).toContain('mutationSummary');
  });
});
