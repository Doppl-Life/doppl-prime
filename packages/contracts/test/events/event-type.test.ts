// P0.1 (+P0.1-amend) — RunEventType: closed 36-member registry. spec(§4): ARCHITECTURE.md §4 /
// RISK-006 (every lifecycle + failure/terminal type representable; unlisted types rejected). The
// P0.1-amend adds 11 operation-start / in-flight observability markers (25→36); closure preserved.
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

// P0.1-amend: the 11 operation-start / in-flight observability markers.
const MARKERS_11 = [
  'generation.verifying',
  'generation.scoring',
  'generation.reproducing',
  'candidate.generation_started',
  'critic.review_started',
  'check.started',
  'novelty.scoring_started',
  'judge.review_started',
  'fusion.started',
  'tool_call.started',
  'tool_call.finished',
] as const;

const REGISTRY_36 = [...REGISTRY_25, ...MARKERS_11] as const;

const FAILURE_TERMINAL_7 = [
  'provider_call_failed',
  'output_schema_rejected',
  'candidate_invalidated',
  'energy_exhausted',
  'generation_failed',
  'reproduction_aborted_insufficient_parents',
  'novelty_scoring_degraded',
] as const;

describe('RunEventType — closed 36-member registry (spec §4)', () => {
  it('run_event_type_accepts_36_incl_markers', () => {
    // spec(§4): positive-guard-first — every one of the 36 members parses (the prior 25 + the 11
    // operation-start markers), and the registry is exactly 36.
    for (const t of REGISTRY_36) {
      expect(RunEventType.parse(t)).toBe(t);
    }
    expect(REGISTRY_36).toHaveLength(36);
    for (const m of MARKERS_11) {
      expect(RunEventType.parse(m)).toBe(m);
    }
    expect(MARKERS_11).toHaveLength(11);
  });

  it('run_event_type_still_rejects_out_of_set', () => {
    // spec(§4) / RISK-006: the registry is STILL closed after the amendment — an unlisted type
    // (incl. a marker-adjacent value) is rejected.
    for (const bad of [
      'run.exploded',
      'agenome.teleported',
      'generation.idle',
      'tool_call.aborted',
      '',
    ]) {
      expect(() => RunEventType.parse(bad), bad).toThrow();
    }
  });

  it('event_type_includes_all_failure_terminal_types', () => {
    // spec(§4) / RISK-006: every failure/terminal type is representable (no failure path unrepresentable).
    for (const t of FAILURE_TERMINAL_7) {
      expect(RunEventType.parse(t)).toBe(t);
    }
  });
});
