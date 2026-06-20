// P0.3 — §2.5 cross-track schema-snapshot gate for the config contracts. spec(§4) spec(§2.5):
// RunCaps field-set, RunConfig field-set, and Subtype member-set each equal a checked-in frozen
// snapshot — any add/remove/rename fails here before the parallel tracks consume these contracts.
import { describe, it, expect } from 'vitest';
import { RunCaps, RunConfig, Subtype } from '@doppl/contracts';

const RUN_CAPS_FIELD_SNAPSHOT = [
  'maxPopulation',
  'maxGenerations',
  'energyBudget',
  'maxSpawnDepth',
  'maxToolCalls',
  'wallClockTimeoutMs',
];

const RUN_CONFIG_FIELD_SNAPSHOT = [
  'seed',
  'enabledSubtypes',
  'caps',
  'modelProfile',
  'scoringPolicyVersion',
  'rngSeed',
];

const SUBTYPE_SNAPSHOT = ['cross_domain_transfer', 'zeitgeist_synthesis'];

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('schema snapshots — RunCaps / RunConfig / Subtype (spec §4 / §2.5)', () => {
  it('schema_snapshot_caps_config_subtype_sets', () => {
    expect(sorted(Object.keys(RunCaps.shape))).toEqual(sorted(RUN_CAPS_FIELD_SNAPSHOT));
    expect(sorted(Object.keys(RunConfig.shape))).toEqual(sorted(RUN_CONFIG_FIELD_SNAPSHOT));
    expect(sorted(Subtype.options)).toEqual(sorted(SUBTYPE_SNAPSHOT));
    expect(RUN_CAPS_FIELD_SNAPSHOT).toHaveLength(6);
    expect(RUN_CONFIG_FIELD_SNAPSHOT).toHaveLength(6);
    expect(SUBTYPE_SNAPSHOT).toHaveLength(2);
  });
});
