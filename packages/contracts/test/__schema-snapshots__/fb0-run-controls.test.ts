// FB.0 — frontend-v2 RunConfig run-controls contract amendment (sv5→6). spec(§4) spec(§6) spec(§2.5):
// the new closed GenerationOperator enum + the 3 additive RunConfig optional run-control fields
// (generationOperators / generationBias / modelRouteOverride) are GENERATION inputs (rule #5 DATA,
// rule #6-safe), never scoring/judge levers; the amendment leaves the ScoringPolicy / FinalJudgeRubric
// / FinalJudgeAxis judge-anchor field-sets BYTE-IDENTICAL (rule #6). Backward-compatible: a v5 envelope
// still validates (readers accept schemaVersion ≤ current).
import { describe, it, expect } from 'vitest';
import {
  GenerationOperator,
  ModelRouteOverride,
  RunConfig,
  CURRENT_SCHEMA_VERSION,
  RunEventEnvelope,
  ScoringPolicy,
  FinalJudgeRubric,
  FinalJudgeAxis,
  objectFieldNames,
  validateRunConfig,
  validRunConfig,
  validRunConfigWithControls,
  validRunEventEnvelope,
} from '@doppl/contracts';

const sorted = (a: readonly string[]): string[] => [...a].sort();

// The 7 mutagen-skill operators, snake_case machine-truth (DS rule 5).
const GENERATION_OPERATOR_SNAPSHOT = [
  'breakthrough',
  'first_principles',
  'polymath',
  'breakout',
  'blindside',
  'subtraction',
  'constraint',
];

// RunConfig field-set after the FB.0 amendment: the original 6 + the 3 new optional run-controls.
const RUN_CONFIG_FIELD_SNAPSHOT_V6 = [
  'seed',
  'enabledSubtypes',
  'caps',
  'modelProfile',
  'scoringPolicyVersion',
  'rngSeed',
  'generationOperators',
  'generationBias',
  'modelRouteOverride',
];

// rule #6 — the held-out judge anchor field-sets this amendment must NOT move.
const SCORING_POLICY_FIELD_SNAPSHOT = ['version', 'weights', 'normalization'];
const FINAL_JUDGE_RUBRIC_FIELD_SNAPSHOT = ['axes', 'weights', 'policyVersion', 'immutableToAgents'];
const FINAL_JUDGE_AXIS_SNAPSHOT = [
  'grounding',
  'novelty',
  'feasibility',
  'falsification_survival',
  'subtype_check_pass',
];

describe('FB.0 — RunConfig run-controls amendment (spec §4 / §6 / §2.5)', () => {
  it('test_generation_operator_enum_members', () => {
    // spec(§4) lesson §1: GenerationOperator is a CLOSED allowlist — exactly the 7 snake_case mutagen
    // skills parse, and an out-of-set / mis-cased member is rejected (DS rule 5 machine-truth).
    expect(sorted(GenerationOperator.options)).toEqual(sorted(GENERATION_OPERATOR_SNAPSHOT));
    expect(GENERATION_OPERATOR_SNAPSHOT).toHaveLength(7);
    for (const member of GENERATION_OPERATOR_SNAPSHOT) {
      expect(GenerationOperator.parse(member)).toBe(member);
    }
    expect(GenerationOperator.safeParse('first-principles').success).toBe(false); // hyphen, not snake
    expect(GenerationOperator.safeParse('magic').success).toBe(false);
    expect(GenerationOperator.safeParse('Breakthrough').success).toBe(false); // case-sensitive
  });

  it('test_runconfig_accepts_new_optional_controls', () => {
    // spec(§4): the amendment is ADDITIVE/optional — a RunConfig WITH the new controls parses, and a
    // RunConfig WITHOUT any of them still parses (existing 6 required fields unchanged).
    expect(RunConfig.safeParse(validRunConfig).success).toBe(true); // no controls present
    expect(RunConfig.safeParse(validRunConfigWithControls).success).toBe(true); // all 3 present
    // each control is independently optional.
    expect(
      RunConfig.safeParse({ ...validRunConfig, generationOperators: ['polymath'] }).success,
    ).toBe(true);
    expect(RunConfig.safeParse({ ...validRunConfig, generationBias: 0 }).success).toBe(true);
    expect(
      RunConfig.safeParse({
        ...validRunConfig,
        modelRouteOverride: { critic: { provider: 'ollama', modelId: 'llama3.1' } },
      }).success,
    ).toBe(true);
  });

  it('test_generation_operators_array_min_one', () => {
    // spec(§4): when present, generationOperators is a non-empty array of the closed enum — an empty
    // array (no operator selected ⇒ omit the field) and an unknown member are rejected (Q4 default).
    expect(RunConfig.safeParse({ ...validRunConfig, generationOperators: [] }).success).toBe(false);
    expect(
      RunConfig.safeParse({ ...validRunConfig, generationOperators: ['polymath', 'subtraction'] })
        .success,
    ).toBe(true);
    expect(
      RunConfig.safeParse({ ...validRunConfig, generationOperators: ['polymath', 'nope'] }).success,
    ).toBe(false);
  });

  it('test_generation_bias_bounds', () => {
    // spec(§4): generationBias is a BOUNDED generation hint in [-1, +1] (0 neutral, -1 converge /
    // grounding, +1 diverge / novelty — Q1 default) — endpoints parse, out-of-range rejects. A bounded
    // hint, never an unbounded lever; recorded as a generation input, never a scoring/judge input.
    for (const ok of [-1, -0.5, 0, 0.5, 1]) {
      expect(RunConfig.safeParse({ ...validRunConfig, generationBias: ok }).success, `${ok}`).toBe(
        true,
      );
    }
    for (const bad of [-1.0001, 1.0001, 2, -5]) {
      expect(
        RunConfig.safeParse({ ...validRunConfig, generationBias: bad }).success,
        `${bad}`,
      ).toBe(false);
    }
  });

  it('test_model_route_override_shape', () => {
    // spec(§6): modelRouteOverride is a PARTIAL per-ModelRole override of {provider, modelId} — a
    // subset of roles parses (override THIS role), an unknown role key rejects (closed ModelRole), and
    // the value shape is strict (no credential/url field representable — rule #4). Allowlist-clamping
    // of the actual {role→models} is RUNTIME (FB.2), not the contract's job.
    expect(
      ModelRouteOverride.safeParse({ critic: { provider: 'ollama', modelId: 'llama3.1' } }).success,
    ).toBe(true);
    expect(ModelRouteOverride.safeParse({}).success).toBe(true); // partial ⇒ empty allowed
    expect(
      ModelRouteOverride.safeParse({
        population_generator: { provider: 'openrouter', modelId: 'x' },
        final_judge: { provider: 'openai', modelId: 'y' },
      }).success,
    ).toBe(true);
    // unknown role key rejected (not a ModelRole member).
    expect(
      ModelRouteOverride.safeParse({ overlord: { provider: 'ollama', modelId: 'llama3.1' } })
        .success,
    ).toBe(false);
    // strict value object: an extra (credential-bearing) field is rejected.
    expect(
      ModelRouteOverride.safeParse({
        critic: { provider: 'ollama', modelId: 'llama3.1', apiKey: 'sk-secret' },
      }).success,
    ).toBe(false);
  });

  it('test_runconfig_field_set_snapshot', () => {
    // spec(§4) spec(§2.5): the shared-contract seam — RunConfig's field-name set == the frozen 9-field
    // snapshot (6 original + 3 additive). RunConfig is crossed by gateway/runtime/selection edges, so
    // this is the mandatory schema-snapshot test for the amendment.
    expect(objectFieldNames(RunConfig)).toEqual(sorted(RUN_CONFIG_FIELD_SNAPSHOT_V6));
    expect(RUN_CONFIG_FIELD_SNAPSHOT_V6).toHaveLength(9);
  });

  it('test_current_schema_version_is_6', () => {
    // spec(§4): the deliberate monotonic bump 5→6, pinned by literal so it can't move silently; old
    // envelopes still validate (the contract accepts any positive int; ≤ current is the reader's job).
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
    expect(RunEventEnvelope.safeParse({ ...validRunEventEnvelope, schemaVersion: 5 }).success).toBe(
      true,
    );
    expect(RunEventEnvelope.safeParse({ ...validRunEventEnvelope, schemaVersion: 6 }).success).toBe(
      true,
    );
  });

  it('test_scoring_and_judge_field_sets_unchanged', () => {
    // rule #6 (the floor the organism cannot lift): a run-CONTROL amendment must leave the held-out
    // judge / scoring anchor BYTE-IDENTICAL — the ScoringPolicy, FinalJudgeRubric, and FinalJudgeAxis
    // field/member sets equal their pre-amendment frozen snapshots (no axis, weight-override, or
    // authority field added; the bias/operator dials never touch this surface).
    expect(objectFieldNames(ScoringPolicy)).toEqual(sorted(SCORING_POLICY_FIELD_SNAPSHOT));
    expect(objectFieldNames(FinalJudgeRubric)).toEqual(sorted(FINAL_JUDGE_RUBRIC_FIELD_SNAPSHOT));
    expect(sorted(FinalJudgeAxis.options)).toEqual(sorted(FINAL_JUDGE_AXIS_SNAPSHOT));
    expect(FINAL_JUDGE_AXIS_SNAPSHOT).toHaveLength(5);
    // the immutability literal-`true` pin is untouched.
    expect(FinalJudgeRubric.shape.immutableToAgents.parse(true)).toBe(true);
    expect(() => FinalJudgeRubric.shape.immutableToAgents.parse(false)).toThrow();
  });

  it('test_valid_runconfig_fixtures_parse', () => {
    // fixture-lockstep (§16): the canonical validRunConfig (no controls) AND the new-controls variant
    // both safeParse OK against the live schema — the cross-track agreement artifact stays valid.
    expect(RunConfig.safeParse(validRunConfig).success).toBe(true);
    expect(RunConfig.safeParse(validRunConfigWithControls).success).toBe(true);
    expect(validRunConfigWithControls.generationOperators).toBeDefined();
    expect(validRunConfigWithControls.generationBias).toBeDefined();
    expect(validRunConfigWithControls.modelRouteOverride).toBeDefined();
  });

  it('test_validate_runconfig_merges_controls_across_layers', () => {
    // spec(§15): the PRODUCTION boot path — validateRunConfig deep-merges defaults<file<env THEN
    // parses. The new optional controls must survive the merge: caps live in defaults, generationBias
    // + one modelRouteOverride role in file, generationOperators + a SECOND override role in env. The
    // two-layer modelRouteOverride exercises deepMerge's nested field-by-field branch (both roles
    // present in the result, not last-layer-wins).
    const result = validateRunConfig({
      defaults: { ...validRunConfig },
      file: {
        generationBias: 0.5,
        modelRouteOverride: { critic: { provider: 'ollama', modelId: 'llama3.1' } },
      },
      env: {
        generationOperators: ['polymath'],
        modelRouteOverride: { final_judge: { provider: 'openrouter', modelId: 'x' } },
      },
    });
    expect(result.generationBias).toBe(0.5);
    expect(result.generationOperators).toEqual(['polymath']);
    expect(result.modelRouteOverride?.critic).toEqual({ provider: 'ollama', modelId: 'llama3.1' });
    expect(result.modelRouteOverride?.final_judge).toEqual({
      provider: 'openrouter',
      modelId: 'x',
    });
  });

  it('test_validate_runconfig_rejects_invalid_control_layer', () => {
    // spec(§15): an invalid control supplied via ANY source layer fails the boot validator fast with a
    // field-identifying error (the schema does the rejecting; validateRunConfig names the offending
    // path). An out-of-range generationBias and an unknown GenerationOperator each throw, naming the field.
    expect(() =>
      validateRunConfig({ defaults: { ...validRunConfig }, file: {}, env: { generationBias: 2 } }),
    ).toThrow(/generationBias/);
    expect(() =>
      validateRunConfig({
        defaults: { ...validRunConfig },
        file: {},
        env: { generationOperators: ['magic'] },
      }),
    ).toThrow(/generationOperators/);
  });
});
