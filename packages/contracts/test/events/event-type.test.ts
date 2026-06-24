// P0.1 (+P0.1-amend, +judge-output amendment, +terminal-event amendment, +FB.6 telemetry) —
// RunEventType: closed 42-member registry. spec(§4): ARCHITECTURE.md §4 / RISK-006 (every lifecycle +
// failure/terminal type representable; unlisted types rejected). P0.1-amend adds 11 operation-start /
// in-flight markers (25→36); the judge-output amendment adds the terminal `judge.reviewed` (36→37); the
// terminal-event amendment (sv4→5) adds the 4 reachable terminals — run.cancelled / generation.skipped /
// agenome.failed / candidate.rejected (37→41); frontend-v2 FB.6 (sv6→7) adds `llm_call_telemetry`
// (41→42) — so every §3/§5 terminal is rule-#2 replayable; closure preserved.
import { describe, it, expect } from 'vitest';
import { RunEventType } from '@doppl/contracts';

// non-marker members (lifecycle + failure/terminal + deep telemetry): 26 → 30 (terminal-event
// amendment) → 31 (frontend-v2 FB.6 +llm_call_telemetry deep-telemetry capture).
const REGISTRY_31 = [
  // lifecycle
  'run.configured',
  'run.started',
  'run.completed',
  'run.failed',
  'run.stopped',
  'run.cancelled', // terminal-event amendment: operator-cancel of a configured (not-yet-running) run.
  'generation.started',
  'generation.completed',
  'generation.skipped', // terminal-event amendment: a pending generation skipped by the kill switch.
  'agenome.spawned',
  'agenome.fused',
  'agenome.mutated',
  'agenome.reproduced',
  'candidate.created',
  'critic.reviewed',
  'check.completed',
  // judge-output amendment: held-out judge acceptance result (terminal; narrows to JudgeResult).
  'judge.reviewed',
  'novelty.scored',
  'fitness.scored',
  'lineage.culled',
  'energy.spent',
  // failure / terminal
  'provider_call_failed',
  'output_schema_rejected',
  'candidate_invalidated',
  'energy_exhausted',
  'generation_failed',
  'reproduction_aborted_insufficient_parents',
  'novelty_scoring_degraded',
  'agenome.failed', // terminal-event amendment: agenome active→failed terminal.
  'candidate.rejected', // terminal-event amendment: candidate under_review→rejected terminal.
  // frontend-v2 FB.6 (sv6→7): deep-telemetry capture of a successful generation LLM call's raw output.
  'llm_call_telemetry',
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

const REGISTRY_42 = [...REGISTRY_31, ...MARKERS_11] as const;

// failure/terminal types (RISK-006): 7 → 9 after the terminal-event amendment (+agenome.failed,
// +candidate.rejected).
const FAILURE_TERMINAL_9 = [
  'provider_call_failed',
  'output_schema_rejected',
  'candidate_invalidated',
  'energy_exhausted',
  'generation_failed',
  'reproduction_aborted_insufficient_parents',
  'novelty_scoring_degraded',
  'agenome.failed',
  'candidate.rejected',
] as const;

// terminal-event amendment: the 4 new reachable-terminal recording events (§3/§5 → rule #2 replayable).
const NEW_TERMINALS_4 = [
  'run.cancelled',
  'generation.skipped',
  'agenome.failed',
  'candidate.rejected',
] as const;

describe('RunEventType — closed 42-member registry (spec §4)', () => {
  it('run_event_type_has_42_members_incl_telemetry', () => {
    // spec(§4): positive-guard-first — every one of the 42 members parses, and the registry is exactly
    // 42 (31 non-marker + 11 markers). The FB.6 llm_call_telemetry member is present.
    for (const t of REGISTRY_42) {
      expect(RunEventType.parse(t)).toBe(t);
    }
    expect(REGISTRY_42).toHaveLength(42);
    for (const m of MARKERS_11) {
      expect(RunEventType.parse(m)).toBe(m);
    }
    expect(MARKERS_11).toHaveLength(11);
    // the 4 reachable terminals added by the terminal-event amendment are members — and are NOT markers
    // (they record a §3/§5 terminal transition, not an operation-start / in-flight window).
    for (const t of NEW_TERMINALS_4) {
      expect(RunEventType.parse(t)).toBe(t);
      expect(MARKERS_11).not.toContain(t);
    }
    // the judge-output amendment's terminal type stays a member and is NOT a marker.
    expect(RunEventType.parse('judge.reviewed')).toBe('judge.reviewed');
    expect(MARKERS_11).not.toContain('judge.reviewed');
  });

  it('run_event_type_still_rejects_out_of_set', () => {
    // spec(§4) / RISK-006: the registry is STILL closed after the amendment — an unlisted type
    // (incl. a terminal-adjacent value) is rejected.
    for (const bad of [
      'run.exploded',
      'agenome.teleported',
      'generation.idle',
      'tool_call.aborted',
      'candidate.accepted', // adjacent to candidate.rejected, but not a member
      '',
    ]) {
      expect(() => RunEventType.parse(bad), bad).toThrow();
    }
  });

  it('event_type_includes_all_failure_terminal_types', () => {
    // spec(§4) / RISK-006: every failure/terminal type is representable (no failure path unrepresentable);
    // the terminal-event amendment grows the set 7 → 9 (+agenome.failed, +candidate.rejected).
    for (const t of FAILURE_TERMINAL_9) {
      expect(RunEventType.parse(t)).toBe(t);
    }
    expect(FAILURE_TERMINAL_9).toHaveLength(9);
  });
});
