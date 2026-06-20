// P0.1 — RunEventType: closed 25-member registry. spec(§4): ARCHITECTURE.md §4 / RISK-006
// (every lifecycle + failure/terminal type representable; unlisted types rejected).
import { describe, it, expect } from 'vitest';
import { RunEventType } from '@doppl/contracts';

const REGISTRY_25 = [
  'run.configured',
  'run.started',
  'run.completed',
  'run.failed',
  'run.stopped',
  'generation.started',
  'generation.completed',
  'agenome.spawned',
  'agenome.fused',
  'agenome.mutated',
  'agenome.reproduced',
  'candidate.created',
  'critic.reviewed',
  'check.completed',
  'novelty.scored',
  'fitness.scored',
  'lineage.culled',
  'energy.spent',
  'provider_call_failed',
  'output_schema_rejected',
  'candidate_invalidated',
  'energy_exhausted',
  'generation_failed',
  'reproduction_aborted_insufficient_parents',
  'novelty_scoring_degraded',
] as const;

const FAILURE_TERMINAL_7 = [
  'provider_call_failed',
  'output_schema_rejected',
  'candidate_invalidated',
  'energy_exhausted',
  'generation_failed',
  'reproduction_aborted_insufficient_parents',
  'novelty_scoring_degraded',
] as const;

describe('RunEventType — closed 25-member registry (spec §4)', () => {
  it('event_type_accepts_every_registry_member', () => {
    // spec(§4): all 25 named members parse to themselves.
    for (const t of REGISTRY_25) {
      expect(RunEventType.parse(t)).toBe(t);
    }
    expect(REGISTRY_25).toHaveLength(25);
  });

  it('event_type_rejects_unlisted_type', () => {
    // spec(§4): the closed registry rejects any unlisted type.
    expect(() => RunEventType.parse('run.exploded')).toThrow();
    expect(() => RunEventType.parse('agenome.teleported')).toThrow();
    expect(() => RunEventType.parse('')).toThrow();
  });

  it('event_type_includes_all_failure_terminal_types', () => {
    // spec(§4) / RISK-006: every failure/terminal type is representable (no failure path unrepresentable).
    for (const t of FAILURE_TERMINAL_7) {
      expect(RunEventType.parse(t)).toBe(t);
    }
  });
});
