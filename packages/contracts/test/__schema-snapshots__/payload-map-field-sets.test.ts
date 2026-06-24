// P0.10 — §2.5 cross-track schema-snapshot gate for the per-type payload map. SAFETY-relevant: the
// high-traffic key-set IS the §4 narrowing contract — adding/removing/remapping a high-traffic type
// (silently widening one to the generic JSONB payload) is a Step-9 Finding. spec(§4) spec(§2.5):
// the key-set == frozen snapshot; every key ∈ RunEventType; each key maps (by reference identity) to
// its frozen Appendix-A model, and resolvePayloadSchema returns that same model.
import { describe, it, expect } from 'vitest';
import {
  HIGH_TRAFFIC_PAYLOAD_MAP,
  resolvePayloadSchema,
  MAX_PAYLOAD_BYTES,
  MAX_PAYLOAD_DEPTH,
  RunEventType,
  EnergyEvent,
  CandidateIdea,
  CriticReview,
  CheckResult,
  NoveltyScore,
  FitnessScore,
  JudgeResult,
  LlmCallTelemetry,
} from '@doppl/contracts';

const HIGH_TRAFFIC_SNAPSHOT = [
  'energy.spent',
  'candidate.created',
  'critic.reviewed',
  'check.completed',
  'novelty.scored',
  'fitness.scored',
  // judge-output amendment: held-out judge acceptance result.
  'judge.reviewed',
  // frontend-v2 FB.6: deep-telemetry capture of a successful generation LLM call.
  'llm_call_telemetry',
];

const EXPECTED_MAPPING = {
  'energy.spent': EnergyEvent,
  'candidate.created': CandidateIdea,
  'critic.reviewed': CriticReview,
  'check.completed': CheckResult,
  'novelty.scored': NoveltyScore,
  'fitness.scored': FitnessScore,
  'judge.reviewed': JudgeResult,
  'llm_call_telemetry': LlmCallTelemetry,
} as const;

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('schema snapshot — high-traffic payload map (spec §4 / §2.5)', () => {
  it('schema_snapshot_payload_map', () => {
    // the high-traffic key-set is frozen to exactly eight members (FB.6 added llm_call_telemetry)
    expect(sorted(Object.keys(HIGH_TRAFFIC_PAYLOAD_MAP))).toEqual(sorted(HIGH_TRAFFIC_SNAPSHOT));
    expect(HIGH_TRAFFIC_SNAPSHOT).toHaveLength(8);

    // every high-traffic key is a valid RunEventType member (no orphan key outside the registry)
    for (const key of HIGH_TRAFFIC_SNAPSHOT) {
      expect(RunEventType.options).toContain(key);
    }

    // each key maps (by reference identity) to its expected frozen model, and the resolver returns
    // that same model — a per-key fixture round-trip through resolvePayloadSchema
    for (const [key, model] of Object.entries(EXPECTED_MAPPING)) {
      expect(HIGH_TRAFFIC_PAYLOAD_MAP[key as keyof typeof EXPECTED_MAPPING]).toBe(model);
      expect(resolvePayloadSchema(key as RunEventType)).toBe(model);
    }
  });

  it('schema_snapshot_ceiling_constants', () => {
    // spec(§4): pin the LITERAL ceiling values. #8–#10 assert behavior RELATIVE to the constants, so
    // a silent raise of the depth/byte bound (the brief calls weakening the ceiling a Step-9 Finding)
    // would still pass them. This literal snapshot makes any future tune a test-breaking, reviewable
    // diff — same mechanical-pin discipline as every other invariant (lesson §1/§11). Stays tunable;
    // it just can't move silently.
    expect(MAX_PAYLOAD_BYTES).toBe(1_048_576);
    expect(MAX_PAYLOAD_DEPTH).toBe(32);
  });
});
