// P0.14 — contract-test surface: consolidated field-set snapshot + closed-union sweep + barrel
// completeness (ARCHITECTURE.md §16 / §2.5 / §4). spec(§2.5): the single consolidated cross-track
// regression gate — every §2.5 model's field-name set == a frozen snapshot, so any add/remove/rename
// is caught before tracks fork. spec(§4) lesson §1: every closed union rejects an out-of-set value.
// (Per-slice *-field-sets.test.ts stay as-is; this CONSOLIDATES the gate into one shipped harness.)
import { describe, it, expect } from 'vitest';
import {
  objectFieldNames,
  FIELD_SET_SNAPSHOTS,
  CANONICAL_FIXTURES,
  // object models
  RunEventEnvelope,
  RunConfig,
  RunCaps,
  Agenome,
  CandidateIdea,
  CrossDomainTransferPayload,
  ZeitgeistSynthesisPayload,
  EvidenceRef,
  CriticReview,
  criticInput,
  CheckResult,
  CheckRunnerAdapter,
  NoveltyScore,
  FitnessScore,
  ScoringPolicy,
  EnergyEvent,
  ReproductionEvent,
  ProviderMeta,
  ModelRoute,
  ProviderCapability,
  ModelGatewayRequest,
  ModelGatewayResponse,
  Run,
  Generation,
  CullingEvent,
  LineageGraphProjection,
  LineageNode,
  LineageEdge,
  FinalJudgeRubric,
  JudgeResult,
  LlmCallTelemetry,
  // closed unions
  RunEventType,
  Actor,
  ModelRole,
  CriticMandate,
  Subtype,
  ChatRole,
  ValidationResult,
  EvidenceKind,
  CheckStatus,
  CandidateStatus,
  AgenomeStatus,
  EnergyEventType,
  ReproductionMode,
  RunStatus,
  GenerationStatus,
  LineageNodeType,
  FinalJudgeAxis,
  GenerationOperator,
  ToolName,
} from '@doppl/contracts';

const sorted = (a: readonly string[]): string[] => [...a].sort();

// name → object schema (every strictObject/object model with a frozen field-set). CandidateIdea is a
// discriminated union (no top-level `.shape`) and is handled separately below.
const OBJECT_MODELS: Record<string, { shape: Record<string, unknown> }> = {
  RunEventEnvelope,
  RunConfig,
  RunCaps,
  Agenome,
  CrossDomainTransferPayload,
  ZeitgeistSynthesisPayload,
  EvidenceRef,
  CriticReview,
  criticInput,
  CheckResult,
  CheckRunnerAdapter,
  NoveltyScore,
  FitnessScore,
  ScoringPolicy,
  EnergyEvent,
  ReproductionEvent,
  ProviderMeta,
  ModelRoute,
  ProviderCapability,
  ModelGatewayRequest,
  ModelGatewayResponse,
  Run,
  Generation,
  CullingEvent,
  LineageGraphProjection,
  LineageNode,
  LineageEdge,
  FinalJudgeRubric,
  JudgeResult,
  LlmCallTelemetry,
};

// the 17 closed unions: a valid member parses AND an out-of-set value rejects (lesson §1).
const UNION_SWEEP = [
  { name: 'RunEventType', schema: RunEventType, valid: 'run.started', invalid: 'run.exploded' },
  { name: 'Actor', schema: Actor, valid: 'operator', invalid: 'intruder' },
  { name: 'ModelRole', schema: ModelRole, valid: 'critic', invalid: 'overlord' },
  { name: 'CriticMandate', schema: CriticMandate, valid: 'feasibility', invalid: 'style' },
  { name: 'Subtype', schema: Subtype, valid: 'zeitgeist_synthesis', invalid: 'meme' },
  { name: 'ChatRole', schema: ChatRole, valid: 'user', invalid: 'root' },
  { name: 'ValidationResult', schema: ValidationResult, valid: 'accepted', invalid: 'maybe' },
  { name: 'EvidenceKind', schema: EvidenceKind, valid: 'prior_art', invalid: 'rumor' },
  { name: 'CheckStatus', schema: CheckStatus, valid: 'passed', invalid: 'errored' },
  { name: 'CandidateStatus', schema: CandidateStatus, valid: 'created', invalid: 'archived' },
  { name: 'AgenomeStatus', schema: AgenomeStatus, valid: 'seeded', invalid: 'zombie' },
  { name: 'EnergyEventType', schema: EnergyEventType, valid: 'llm', invalid: 'magic' },
  { name: 'ReproductionMode', schema: ReproductionMode, valid: 'fusion', invalid: 'cloning' },
  { name: 'RunStatus', schema: RunStatus, valid: 'configured', invalid: 'paused' },
  { name: 'GenerationStatus', schema: GenerationStatus, valid: 'pending', invalid: 'halted' },
  { name: 'LineageNodeType', schema: LineageNodeType, valid: 'candidate', invalid: 'cluster' },
  { name: 'FinalJudgeAxis', schema: FinalJudgeAxis, valid: 'grounding', invalid: 'vibes' },
  // frontend-v2 FB.0: the closed mutagen-operator allowlist joins the exhaustive out-of-set gate.
  {
    name: 'GenerationOperator',
    schema: GenerationOperator,
    valid: 'first_principles',
    invalid: 'first-principles',
  },
  // tool-use TU.1: the closed research-tool allowlist joins the exhaustive out-of-set gate (rule #3).
  { name: 'ToolName', schema: ToolName, valid: 'web_search', invalid: 'exec_shell' },
];

describe('contract-test surface — field-set snapshot + union sweep + barrel (spec §16 / §2.5 / §4)', () => {
  it('field_sets_match_frozen_snapshot', () => {
    // spec(§2.5): each §2.5 model's current field-name set === the frozen snapshot in the harness.
    for (const [name, schema] of Object.entries(OBJECT_MODELS)) {
      const snapshot = FIELD_SET_SNAPSHOTS[name];
      expect(snapshot, `snapshot missing for ${name}`).toBeDefined();
      expect(objectFieldNames(schema), name).toEqual(sorted(snapshot ?? []));
    }
    // CandidateIdea: both discriminated variants share the frozen 11-field top-level set.
    expect(CandidateIdea.options).toHaveLength(2);
    for (const variant of CandidateIdea.options) {
      expect(objectFieldNames(variant)).toEqual(sorted(FIELD_SET_SNAPSHOTS.CandidateIdea ?? []));
    }
    // no orphan snapshot key — every frozen field-set maps to a real model.
    const modeled = new Set([...Object.keys(OBJECT_MODELS), 'CandidateIdea']);
    for (const key of Object.keys(FIELD_SET_SNAPSHOTS)) {
      expect(modeled.has(key), `orphan snapshot: ${key}`).toBe(true);
    }
    // fixture↔snapshot LOCKSTEP — every object model with a field-set has a canonical fixture of the
    // same name, AND every non-narrowing/non-variant fixture has a field-set snapshot. So a future
    // §2.5 model can't ship a fixture without a snapshot (or vice-versa) and slip the cross-track gate.
    const fixtureNames = new Set(CANONICAL_FIXTURES.map((f) => f.name));
    for (const name of Object.keys(OBJECT_MODELS)) {
      expect(
        fixtureNames.has(name),
        `object model ${name} has a field-set but no canonical fixture`,
      ).toBe(true);
    }
    for (const { name } of CANONICAL_FIXTURES) {
      if (name.startsWith('payload:') || name.startsWith('CandidateIdea:')) continue;
      expect(FIELD_SET_SNAPSHOTS[name], `fixture ${name} has no field-set snapshot`).toBeDefined();
    }
  });

  it('every_closed_union_rejects_out_of_set', () => {
    // spec(§4) lesson §1: positive-guard-first — a valid member parses AND an out-of-set value rejects,
    // for every closed union (cross-track agreement on the enumerated value set).
    expect(UNION_SWEEP).toHaveLength(19);
    for (const { name, schema, valid, invalid } of UNION_SWEEP) {
      expect(schema.parse(valid), `${name} member`).toBe(valid);
      expect(schema.safeParse(invalid).success, `${name} rejects ${invalid}`).toBe(false);
    }
  });

  it('barrel_exports_every_model_and_type', () => {
    // spec(§2.5) lesson §5: a track imports exactly one package boundary — the barrel surface must
    // include every object schema, every closed union, the fixtures registry, and the harness.
    for (const [name, schema] of Object.entries(OBJECT_MODELS)) {
      expect(typeof (schema as { parse?: unknown }).parse, `${name} schema export`).toBe(
        'function',
      );
    }
    for (const { name, schema } of UNION_SWEEP) {
      expect(typeof schema.parse, `${name} union export`).toBe('function');
    }
    expect(typeof CandidateIdea.parse).toBe('function');
    expect(typeof objectFieldNames).toBe('function');
    expect(FIELD_SET_SNAPSHOTS).toBeDefined();
    expect(Array.isArray(CANONICAL_FIXTURES)).toBe(true);
  });
});
