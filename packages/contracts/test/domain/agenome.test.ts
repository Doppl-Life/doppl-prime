// P0.4 — Agenome: the agent-genome unit. spec(§3): ARCHITECTURE.md §3 domain model + the closed
// 7-state Agenome state machine. The schema encodes SHAPE only — count/clamp rules (parentIds 0–2,
// spawnBudget clamp) are kernel-enforced (P3), never in the contract.
import { describe, it, expect } from 'vitest';
import { Agenome, AgenomeStatus } from '@doppl/contracts';

const validAgenome = {
  id: 'agn_1',
  runId: 'run_1',
  generationId: 'gen_1',
  parentIds: ['agn_p1', 'agn_p2'],
  systemPrompt: 'You are an idea-generating agent.',
  personaWeights: { explorer: 0.7, skeptic: 0.3 },
  toolPermissions: ['web_search', 'retrieval'],
  decompositionPolicy: 'default-policy',
  spawnBudget: 5,
  mutationMeta: { mode: 'point', mutatedFields: ['systemPrompt'], summary: 'tweaked prompt' },
  status: 'active',
};

const REQUIRED_KEYS = [
  'id',
  'runId',
  'generationId',
  'parentIds',
  'systemPrompt',
  'personaWeights',
  'toolPermissions',
  'decompositionPolicy',
  'spawnBudget',
  'status',
] as const;

const STATUS_STATES = [
  'seeded',
  'active',
  'spent',
  'eligible_parent',
  'failed',
  'reproduced',
  'culled',
] as const;

describe('Agenome — agent-genome unit (spec §3)', () => {
  it('agenome_accepts_valid_full', () => {
    // spec(§3): a full 11-field agenome parses and round-trips.
    expect(Agenome.parse(validAgenome)).toEqual(validAgenome);
  });

  it('agenome_accepts_gen0_without_mutationMeta', () => {
    // spec(§3): gen-0 seeded agenomes have no mutation provenance — mutationMeta is optional.
    const gen0: Record<string, unknown> = { ...validAgenome, parentIds: [], status: 'seeded' };
    delete gen0.mutationMeta;
    expect(Agenome.parse(gen0)).toEqual(gen0);
  });

  it('agenome_status_closed_7_state', () => {
    // spec(§3): status is the closed 7-state union; any other value is rejected.
    for (const s of STATUS_STATES) {
      expect(AgenomeStatus.parse(s)).toBe(s);
      expect(Agenome.parse({ ...validAgenome, status: s }).status).toBe(s);
    }
    expect(STATUS_STATES).toHaveLength(7);
    expect(() => AgenomeStatus.parse('zombie')).toThrow();
    expect(() => AgenomeStatus.parse('')).toThrow();
    expect(() => Agenome.parse({ ...validAgenome, status: 'zombie' })).toThrow();
  });

  it('agenome_parentIds_count_not_enforced', () => {
    // spec(§3): parentIds count (0–2) is a kernel relationship rule, NOT a schema constraint —
    // 0, 1, 2, or more all parse structurally.
    for (const parents of [[], ['a'], ['a', 'b'], ['a', 'b', 'c']]) {
      expect(Agenome.parse({ ...validAgenome, parentIds: parents }).parentIds).toEqual(parents);
    }
  });

  it('agenome_spawnBudget_nonnegative_int', () => {
    // spec(§3): spawnBudget is a hint non-negative integer (the kernel clamps it, P3); 0 is valid.
    expect(Agenome.parse({ ...validAgenome, spawnBudget: 0 }).spawnBudget).toBe(0);
    expect(Agenome.parse({ ...validAgenome, spawnBudget: 5 }).spawnBudget).toBe(5);
    expect(() => Agenome.parse({ ...validAgenome, spawnBudget: -1 })).toThrow();
    expect(() => Agenome.parse({ ...validAgenome, spawnBudget: 1.5 })).toThrow();
    expect(() => Agenome.parse({ ...validAgenome, spawnBudget: '3' })).toThrow();
  });

  it('agenome_strict_unknown_and_missing', () => {
    // spec(§3): strictObject — an unknown top-level field rejected; each required field mandatory.
    expect(() => Agenome.parse({ ...validAgenome, bogus: 1 })).toThrow();
    for (const k of REQUIRED_KEYS) {
      const clone: Record<string, unknown> = { ...validAgenome };
      delete clone[k];
      expect(() => Agenome.parse(clone), `missing ${k}`).toThrow();
    }
  });

  it('agenome_field_type_guards', () => {
    // spec(§3): trait field types — personaWeights is record<string,number>; toolPermissions a string[].
    expect(() => Agenome.parse({ ...validAgenome, personaWeights: 'notobject' })).toThrow();
    expect(() => Agenome.parse({ ...validAgenome, personaWeights: { a: 'notnumber' } })).toThrow();
    expect(() => Agenome.parse({ ...validAgenome, toolPermissions: [1, 2] })).toThrow();
    expect(() => Agenome.parse({ ...validAgenome, toolPermissions: 'notarray' })).toThrow();
    // tool-permission entries are non-empty (consistent with the non-empty-id convention).
    expect(() => Agenome.parse({ ...validAgenome, toolPermissions: ['valid', ''] })).toThrow();
  });
});
