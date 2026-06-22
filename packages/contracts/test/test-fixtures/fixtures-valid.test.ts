// P0.14 — contract-test surface: canonical fixtures (ARCHITECTURE.md §16 contract tests, RISK-014 /
// REQ-T-007). spec(§16): every cross-track producer/consumer validates its I/O against ONE canonical
// valid fixture per Appendix-A model, shipped from the package. A canonical fixture that doesn't
// validate is worse than none — so this asserts each round-trips through its schema. spec(§4): the
// z.infer types are the single source of truth (fixtures are assignable to them, compile-time).
import { describe, it, expect } from 'vitest';
import { CANONICAL_FIXTURES, CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type {
  RunEventEnvelope,
  FinalJudgeRubric,
  Run,
  ModelGatewayResponse,
  CandidateIdea,
} from '@doppl/contracts';
import {
  validRunEventEnvelope,
  validFinalJudgeRubric,
  validRun,
  validModelGatewayResponse,
  validCandidateIdeaCrossDomain,
} from '@doppl/contracts';

// The Appendix-A model inventory the surface MUST carry a canonical fixture for (AC1) + the 6
// high-traffic payload-map narrowings.
const EXPECTED_FIXTURE_NAMES = [
  'RunEventEnvelope',
  'RunConfig',
  'RunCaps',
  'Agenome',
  'CandidateIdea:cross_domain_transfer',
  'CandidateIdea:zeitgeist_synthesis',
  'CrossDomainTransferPayload',
  'ZeitgeistSynthesisPayload',
  'EvidenceRef',
  'CriticReview',
  'criticInput',
  'CheckResult',
  'CheckRunnerAdapter',
  'NoveltyScore',
  'FitnessScore',
  'ScoringPolicy',
  'EnergyEvent',
  'ReproductionEvent',
  'ProviderMeta',
  'ModelRoute',
  'ProviderCapability',
  'ModelGatewayRequest',
  'ModelGatewayResponse',
  'Run',
  'Generation',
  'CullingEvent',
  'LineageGraphProjection',
  'FinalJudgeRubric',
  'JudgeResult',
  'payload:energy.spent',
  'payload:candidate.created',
  'payload:critic.reviewed',
  'payload:check.completed',
  'payload:novelty.scored',
  'payload:fitness.scored',
  'payload:judge.reviewed',
] as const;

describe('contract-test surface — canonical fixtures (spec §16)', () => {
  it('every_canonical_fixture_is_valid', () => {
    // spec(§16): each exported canonical fixture round-trips through its schema (table-driven over the
    // registry, including the 6 payload-map narrowings whose schema = resolvePayloadSchema(type)).
    expect(CANONICAL_FIXTURES.length).toBeGreaterThanOrEqual(EXPECTED_FIXTURE_NAMES.length);
    for (const { name, schema, value } of CANONICAL_FIXTURES) {
      const result = schema.safeParse(value);
      expect(
        result.success,
        `${name} invalid: ${result.success ? '' : JSON.stringify(result.error.issues)}`,
      ).toBe(true);
    }
    // completeness: every expected Appendix-A model (+ payload narrowing) has a registered fixture.
    const registered = new Set(CANONICAL_FIXTURES.map((f) => f.name));
    for (const name of EXPECTED_FIXTURE_NAMES) {
      expect(registered.has(name), `missing canonical fixture: ${name}`).toBe(true);
    }
  });

  it('canonical_fixtures_still_valid_at_current_version', () => {
    // spec(§16) [terminal-event amendment]: the canonical envelope fixture is re-recorded at the CURRENT
    // schema version (5 — it tracks CURRENT_SCHEMA_VERSION via the constant, no literal pin); the full
    // CANONICAL_FIXTURES sweep (every_canonical_fixture_is_valid) stays green — the P0.14 surface survives
    // the sv4→5 terminal-event amendment (additive: +run.cancelled/generation.skipped/agenome.failed/
    // candidate.rejected).
    expect(CURRENT_SCHEMA_VERSION).toBe(5);
    expect(validRunEventEnvelope.schemaVersion).toBe(5);
  });

  it('types_are_single_source', () => {
    // spec(§4): each model's z.infer type is exported from the barrel AND the canonical fixture is
    // assignable to it — a compile-time single-source-of-truth check (a redefinition or a fixture/type
    // drift fails `pnpm typecheck`). Representative span: envelope (strictObject), rubric (literal pin),
    // run (entity), response (superRefine), candidate (discriminated union).
    // Runtime defined-guard so RED fails on the missing fixtures (not undefined===undefined).
    for (const f of [
      validRunEventEnvelope,
      validFinalJudgeRubric,
      validRun,
      validModelGatewayResponse,
      validCandidateIdeaCrossDomain,
    ]) {
      expect(f).toBeDefined();
    }
    const typed: {
      envelope: RunEventEnvelope;
      rubric: FinalJudgeRubric;
      run: Run;
      response: ModelGatewayResponse;
      candidate: CandidateIdea;
    } = {
      envelope: validRunEventEnvelope,
      rubric: validFinalJudgeRubric,
      run: validRun,
      response: validModelGatewayResponse,
      candidate: validCandidateIdeaCrossDomain,
    };
    expect(typed.envelope).toBe(validRunEventEnvelope);
    expect(typed.rubric).toBe(validFinalJudgeRubric);
    expect(typed.run).toBe(validRun);
    expect(typed.response).toBe(validModelGatewayResponse);
    expect(typed.candidate).toBe(validCandidateIdeaCrossDomain);
  });
});
