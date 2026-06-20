// P0.4 — §2.5 cross-track schema-snapshot gate for Agenome. spec(§3) spec(§2.5): the Agenome
// field-name set (11) and the status member set (7) each equal a checked-in frozen snapshot — any
// add/remove/rename fails here before the kernel/reproduction/event-store tracks consume the model.
import { describe, it, expect } from 'vitest';
import { Agenome, AgenomeStatus } from '@doppl/contracts';

const AGENOME_FIELD_SNAPSHOT = [
  'id',
  'runId',
  'generationId',
  'parentIds',
  'systemPrompt',
  'personaWeights',
  'toolPermissions',
  'decompositionPolicy',
  'spawnBudget',
  'mutationMeta',
  'status',
];

const AGENOME_STATUS_SNAPSHOT = [
  'seeded',
  'active',
  'spent',
  'eligible_parent',
  'failed',
  'reproduced',
  'culled',
];

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('schema snapshot — Agenome field + status sets (spec §3 / §2.5)', () => {
  it('schema_snapshot_agenome_field_and_status_sets', () => {
    expect(sorted(Object.keys(Agenome.shape))).toEqual(sorted(AGENOME_FIELD_SNAPSHOT));
    expect(sorted(AgenomeStatus.options)).toEqual(sorted(AGENOME_STATUS_SNAPSHOT));
    expect(AGENOME_FIELD_SNAPSHOT).toHaveLength(11);
    expect(AGENOME_STATUS_SNAPSHOT).toHaveLength(7);
  });
});
