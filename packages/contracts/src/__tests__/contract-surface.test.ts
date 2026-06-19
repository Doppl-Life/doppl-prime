import { describe, expect, test } from "vitest";
import * as contracts from "../index.js";
import { spec } from "../testing/spec-tag.js";

/**
 * Surface completeness: every Appendix-A model named in
 * IMPLEMENTATION_PLAN.md Phase 0 acceptance criteria (lines 330-340)
 * must be exported from @doppl/contracts. This is the §2.5 freeze-
 * verification gate.
 *
 * The list below is intentionally hand-curated — adding a new contract
 * here is the same action as registering it as a §2.5 cross-track seam,
 * so the manual addition is part of the freeze discipline.
 */

const REQUIRED_EXPORTS = [
  // Foundation
  "CONTRACTS_SCHEMA_VERSION",
  "fieldset",
  "spec",
  // Events §4
  "Actor",
  "ActorRoles",
  "RunEventType",
  "RunEventTypeValues",
  "RunEventEnvelope",
  "RunEventPayloadMap",
  "parseEventPayload",
  // Security §14
  "REDACTION_PLACEHOLDER",
  "redact",
  // Run / Config §4 §5 §15
  "RunCaps",
  "RunConfig",
  "validateBootConfig",
  "ConfigValidationError",
  // Domain §3
  "Agenome",
  "AgenomeStatus",
  "AgenomeStatusValues",
  "CandidateIdea",
  "CandidateIdeaFieldNames",
  "CandidateStatus",
  "CandidateStatusValues",
  "CrossDomainTransferPayload",
  "SubtypeName",
  "SubtypeNameValues",
  "ZeitgeistSynthesisPayload",
  "CullingEvent",
  "FINAL_JUDGE_AXES",
  "FinalJudgeRubric",
  "Generation",
  "GenerationStatus",
  "GenerationStatusValues",
  "Run",
  "RunStatus",
  "RunStatusValues",
  "TerminalRunStatus",
  "TerminalRunStatusValues",
  // Evidence §9
  "EvidenceKind",
  "EvidenceKindValues",
  "EvidenceRef",
  // Verifier §7 §14
  "CriticMandate",
  "CriticMandateValues",
  "CriticReview",
  "CRITIC_INPUT_DELIMITER",
  "CriticInput",
  // Checks §7
  "CheckResult",
  "CheckStatus",
  "CheckStatusValues",
  "CheckRunnerAdapter",
  // Scoring §8
  "FitnessScore",
  "NoveltyScore",
  "ScoringPolicy",
  // Reproduction §4 §8
  "EnergyEvent",
  "EnergyEventType",
  "EnergyEventTypeValues",
  "ReproductionEvent",
  "ReproductionMode",
  "ReproductionModeValues",
  // Gateway §9
  "ModelRole",
  "ModelRoleValues",
  "ModelRoute",
  "ProviderCapability",
  "ModelGatewayRequest",
  "ModelGatewayResponse",
  // Projections §9
  "LineageEdge",
  "LineageGraphProjection",
  "LineageNode",
  "LineageNodeType",
  "LineageNodeTypeValues",
] as const;

describe(`${spec("§2.5")} contract surface — every Appendix-A model is exported`, () => {
  for (const name of REQUIRED_EXPORTS) {
    test(`exports ${name}`, () => {
      expect(contracts).toHaveProperty(name);
      expect((contracts as unknown as Record<string, unknown>)[name]).toBeDefined();
    });
  }

  test("CONTRACTS_SCHEMA_VERSION is the integer 1 (forward-compat anchor)", () => {
    expect(contracts.CONTRACTS_SCHEMA_VERSION).toBe(1);
  });
});
