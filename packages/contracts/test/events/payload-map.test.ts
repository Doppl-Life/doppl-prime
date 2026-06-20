// P0.10 — per-type payload-shape map + payload-DoS ceiling (ARCHITECTURE.md §4/§8/§9). SECURITY
// slice: input-validation on the authoritative event log (high-traffic payloads are NARROWED, not
// generic) + a bounded payload size/depth ceiling (the P0.1 security carry-forward). The narrowing
// is a SEPARATE layer over the frozen RunEventEnvelope — it reuses the six frozen P0.5–P0.9 models
// unchanged and never mutates the envelope. spec(§4): same Zod schema validates the write + the model.
import { describe, it, expect } from 'vitest';
import {
  HIGH_TRAFFIC_PAYLOAD_MAP,
  GENERIC_PAYLOAD_SCHEMA,
  resolvePayloadSchema,
  enforcePayloadCeiling,
  validateEventPayload,
  MAX_PAYLOAD_BYTES,
  MAX_PAYLOAD_DEPTH,
  type RunEventType,
} from '@doppl/contracts';

// ── valid fixtures (the frozen P0.5–P0.9 Appendix-A models, reused unchanged) ──────────────────
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
};

const validCandidate = {
  id: 'cand_1',
  runId: 'run_1',
  generationId: 'gen_1',
  agenomeId: 'agn_1',
  title: 'Immune-inspired cold-start recommender',
  summary: 'Apply affinity maturation to surface niche items for new users.',
  claims: ['CF underperforms on cold-start'],
  evidenceRefs: [{ kind: 'prior_art', label: 'AIRS 2003' }],
  status: 'created',
  subtype: 'cross_domain_transfer',
  subtypePayload: {
    sourceDomain: 'immunology',
    sourceTechnique: 'clonal selection',
    targetDomain: 'recommender systems',
    targetProblem: 'cold-start personalization',
    transferMapping: 'antigens→items, antibodies→user-affinity vectors',
    expectedMechanism: 'affinity maturation surfaces niche items faster than CF',
    executableCheckIdea: 'A/B vs CF baseline on held-out cold-start users',
  },
};

const validReview = {
  id: 'rev_1',
  candidateId: 'cand_1',
  mandate: 'factual_grounding',
  scores: { grounding: 4, citations: 3 },
  critique: 'Claims are well-grounded but two citations are weak.',
  confidence: 0.8,
  evidenceRefs: [{ kind: 'check_output', eventId: 'evt_9' }],
};

const validCheck = {
  id: 'chk_1',
  candidateId: 'cand_1',
  checkType: 'citation_resolves',
  status: 'passed',
  score: 0.9,
  output: 'all 3 citations resolved',
  evidenceRefs: [{ kind: 'check_output', eventId: 'evt_3' }],
};

const validNovelty = {
  id: 'nov_1',
  candidateId: 'cand_1',
  vector: [0.12, -0.4, 0.91],
  embeddingModelId: 'text-embedding-3-small',
  dimension: 3,
  comparisonSet: ['cand_2', 'cand_3'],
  method: 'cosine',
  score: 0.72,
  explanation: 'Distinct from the 2 nearest prior candidates.',
};

const validFitness = {
  id: 'fit_1',
  candidateId: 'cand_1',
  total: 0.81,
  components: {
    critic: 0.7,
    novelty: 0.72,
    energy_efficiency: 0.9,
    judge_acceptance: 1,
    subtype_check: 0.6,
  },
  policyVersion: 'scoring-v1',
  explanation: 'Weighted sum across 5 signals under scoring-v1.',
};

const HIGH_TRAFFIC_KEYS = [
  'energy.spent',
  'candidate.created',
  'critic.reviewed',
  'check.completed',
  'novelty.scored',
  'fitness.scored',
] as const;

describe('per-type payload map (spec §4)', () => {
  it('payload_map_covers_exactly_six_high_traffic_types', () => {
    // spec(§4): §4 names EXACTLY these six high-traffic types; each value is a usable Zod schema.
    // Positive-guard-first (lesson §10): assert the present six before asserting absence.
    expect(new Set(Object.keys(HIGH_TRAFFIC_PAYLOAD_MAP))).toEqual(new Set(HIGH_TRAFFIC_KEYS));
    expect(Object.keys(HIGH_TRAFFIC_PAYLOAD_MAP)).toHaveLength(6);
    for (const key of HIGH_TRAFFIC_KEYS) {
      expect(typeof HIGH_TRAFFIC_PAYLOAD_MAP[key]?.parse).toBe('function');
    }
  });

  it('resolve_narrows_high_traffic_to_model', () => {
    // spec(§4): the SAME schema validates the event-store write and the Appendix-A model — each
    // high-traffic type resolves to its frozen model and round-trips a valid instance.
    expect(resolvePayloadSchema('energy.spent').parse(validEnergy)).toEqual(validEnergy);
    expect(resolvePayloadSchema('candidate.created').parse(validCandidate)).toEqual(validCandidate);
    expect(resolvePayloadSchema('critic.reviewed').parse(validReview)).toEqual(validReview);
    expect(resolvePayloadSchema('check.completed').parse(validCheck)).toEqual(validCheck);
    expect(resolvePayloadSchema('novelty.scored').parse(validNovelty)).toEqual(validNovelty);
    expect(resolvePayloadSchema('fitness.scored').parse(validFitness)).toEqual(validFitness);
  });

  it('resolve_rejects_mismatched_high_traffic_payload', () => {
    // spec(§4): high-traffic payloads are NARROWED (strict), not generic — a payload missing a
    // required field or carrying an extra field is rejected (no silent generic-accept). The resolver
    // call is statement-level (not inside a toThrow wrapper) so RED fails on the missing symbol, and
    // rejection is asserted via safeParse().success so GREEN passes on real schema rejection.
    const energySchema = resolvePayloadSchema('energy.spent');
    expect(energySchema.safeParse({ ...validEnergy, actual: undefined }).success).toBe(false);
    // a critic.reviewed payload carrying a winner field is rejected (rule #6 — strict CriticReview).
    const criticSchema = resolvePayloadSchema('critic.reviewed');
    expect(criticSchema.safeParse({ ...validReview, winner: 'cand_1' }).success).toBe(false);
  });

  it('resolve_falls_back_to_generic_for_non_high_traffic', () => {
    // spec(§4): a type OUTSIDE the high-traffic set validates against the generic JSONB payload
    // (an arbitrary object is accepted) — the §4 generic-JSONB fallback.
    expect(resolvePayloadSchema('run.started')).toBe(GENERIC_PAYLOAD_SCHEMA);
    expect(resolvePayloadSchema('run.started').parse({ any: 'thing', n: 1 })).toEqual({
      any: 'thing',
      n: 1,
    });
    expect(resolvePayloadSchema('provider_call_failed').parse({ reason: 'timeout' })).toEqual({
      reason: 'timeout',
    });
  });

  it('resolve_own_property_lookup_defeats_prototype_keys', () => {
    // spec(§4) security: own-property allowlist gate (lesson §11) — a crafted prototype-chain `type`
    // resolves to GENERIC, never borrows a schema off Object.prototype.
    for (const protoKey of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      const resolved = resolvePayloadSchema(protoKey as unknown as RunEventType);
      expect(resolved).toBe(GENERIC_PAYLOAD_SCHEMA);
      expect(resolved.parse({ x: 1 })).toEqual({ x: 1 });
    }
  });

  it('novelty_scored_payload_requires_persisted_vector', () => {
    // spec(§9) rule #7: §9 authoritative-once-computed — replay READS the persisted vector and never
    // re-embeds, so the narrowed novelty.scored payload structurally requires vector + provenance.
    const noveltySchema = resolvePayloadSchema('novelty.scored');
    for (const key of ['vector', 'embeddingModelId', 'dimension'] as const) {
      const clone: Record<string, unknown> = { ...validNovelty };
      delete clone[key];
      expect(noveltySchema.safeParse(clone).success, `missing ${key}`).toBe(false);
    }
  });

  it('fitness_scored_payload_links_novelty', () => {
    // spec(§8): explainable-from-events — fitness.scored reuses FitnessScore as-is (Q1=A); the
    // novelty link is the shared candidateId + the components.novelty signal (one novelty.scored per
    // candidate in MVP), NOT a separate noveltyScoreId on the frozen model.
    expect(resolvePayloadSchema('fitness.scored').parse(validFitness)).toEqual(validFitness);
    expect(validFitness.candidateId).toBe(validNovelty.candidateId);
    expect(typeof validFitness.components.novelty).toBe('number');
    // a noveltyScoreId field is NOT part of the frozen FitnessScore (strict reject — link is by join).
    expect(() =>
      resolvePayloadSchema('fitness.scored').parse({ ...validFitness, noveltyScoreId: 'nov_1' }),
    ).toThrow();
  });
});

describe('payload ceiling — bounded DoS guard (spec §4, security)', () => {
  it('enforce_ceiling_accepts_within_bounds', () => {
    // spec(§4) security: positive-guard-first — the ceiling must NOT reject legitimate payloads,
    // including a realistic ~1536-float novelty.scored vector (serializes well under the byte bound).
    expect(enforcePayloadCeiling(validEnergy)).toEqual({ ok: true });
    const bigVectorNovelty = {
      ...validNovelty,
      vector: Array.from({ length: 1536 }, (_unused, i) => i / 1536),
      dimension: 1536,
    };
    expect(enforcePayloadCeiling(bigVectorNovelty)).toEqual({ ok: true });
  });

  it('enforce_ceiling_rejects_oversize', () => {
    // spec(§4) security: serialized size beyond MAX_PAYLOAD_BYTES → max_bytes (payload-size DoS bound).
    const oversize = { blob: 'x'.repeat(MAX_PAYLOAD_BYTES + 1) };
    expect(enforcePayloadCeiling(oversize)).toEqual({ ok: false, violation: 'max_bytes' });
  });

  it('enforce_ceiling_rejects_too_deep_and_is_bounded', () => {
    // spec(§4) security: depth beyond MAX_PAYLOAD_DEPTH → max_depth; AND a pathologically deep input
    // (depth 100_000) returns the violation WITHOUT throwing a RangeError/stack overflow — the check
    // early-exits at the limit and never fully traverses (lesson §8 bounded-on-attacker-input analog).
    let justTooDeep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < MAX_PAYLOAD_DEPTH + 2; i++) justTooDeep = { n: justTooDeep };
    expect(enforcePayloadCeiling(justTooDeep)).toEqual({ ok: false, violation: 'max_depth' });

    let pathological: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 100_000; i++) pathological = { n: pathological };
    expect(() => enforcePayloadCeiling(pathological)).not.toThrow();
    expect(enforcePayloadCeiling(pathological)).toEqual({ ok: false, violation: 'max_depth' });
  });

  it('enforce_ceiling_handles_unserializable_without_throwing', () => {
    // spec(§4) security (added beyond outline per brief Q4): an unserializable/circular payload must
    // NOT throw out of the pure guard — a BigInt (JSON.stringify throws) is treated as max_bytes;
    // a circular ref is caught by the bounded depth walk (the cycle drives depth past the limit).
    expect(() => enforcePayloadCeiling({ big: 10n })).not.toThrow();
    expect(enforcePayloadCeiling({ big: 10n })).toEqual({ ok: false, violation: 'max_bytes' });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => enforcePayloadCeiling(circular)).not.toThrow();
    expect(enforcePayloadCeiling(circular)).toEqual({ ok: false, violation: 'max_depth' });
  });
});

describe('validateEventPayload — composed ceiling-then-shape entry (spec §4)', () => {
  it('validate_event_payload_composes_ceiling_then_shape', () => {
    // spec(§4): the single entry the P1 append path calls — enforces the ceiling, THEN validates the
    // resolved (narrowed-or-generic) schema. A valid narrowed payload passes; a generic payload for a
    // non-high-traffic type passes; a high-traffic shape mismatch fails; a ceiling violation fails.
    expect(validateEventPayload('energy.spent', validEnergy)).toEqual({
      ok: true,
      payload: validEnergy,
    });
    expect(validateEventPayload('run.started', { foo: 'bar' })).toEqual({
      ok: true,
      payload: { foo: 'bar' },
    });

    const shapeFail = validateEventPayload('energy.spent', { ...validEnergy, actual: undefined });
    expect(shapeFail.ok).toBe(false);
    if (!shapeFail.ok) expect(shapeFail.reason).toBe('shape_mismatch');

    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 100_000; i++) deep = { n: deep };
    const ceilingFail = validateEventPayload('run.started', deep);
    expect(ceilingFail.ok).toBe(false);
    if (!ceilingFail.ok) expect(ceilingFail.reason).toBe('max_depth');
  });
});

describe('barrel surface (spec §2.5)', () => {
  it('barrel_exports_payload_map', () => {
    // spec(§2.5): single import boundary — all 7 named symbols re-exported from @doppl/contracts
    // (the 6 brief-named + GENERIC_PAYLOAD_SCHEMA, the shared envelope-shape fallback instance).
    expect(HIGH_TRAFFIC_PAYLOAD_MAP).toBeDefined();
    expect(typeof GENERIC_PAYLOAD_SCHEMA?.parse).toBe('function');
    expect(typeof resolvePayloadSchema).toBe('function');
    expect(typeof enforcePayloadCeiling).toBe('function');
    expect(typeof validateEventPayload).toBe('function');
    expect(typeof MAX_PAYLOAD_BYTES).toBe('number');
    expect(typeof MAX_PAYLOAD_DEPTH).toBe('number');
  });
});
