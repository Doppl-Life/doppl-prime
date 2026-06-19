export { CONTRACTS_SCHEMA_VERSION, type ContractsSchemaVersion } from "./version.js";
export { fieldset } from "./testing/fieldset-snapshot.js";
export { spec } from "./testing/spec-tag.js";

// Events (§4)
export { Actor, ActorRoles } from "./events/actor.js";
export { RunEventType, RunEventTypeValues } from "./events/event-type.js";
export { RunEventEnvelope } from "./events/envelope.js";

// Security (§14)
export { REDACTION_PLACEHOLDER, redact } from "./security/redaction.js";

// Domain (§3)
export { Agenome, AgenomeStatus, AgenomeStatusValues } from "./domain/agenome.js";
export {
  CandidateIdea,
  CandidateIdeaFieldNames,
  CandidateStatus,
  CandidateStatusValues,
} from "./domain/candidate-idea.js";
export {
  CrossDomainTransferPayload,
  SubtypeName,
  SubtypeNameValues,
  ZeitgeistSynthesisPayload,
} from "./domain/subtype-payloads.js";

// Evidence (§9)
export { EvidenceKind, EvidenceKindValues, EvidenceRef } from "./domain/evidence-ref.js";

// Run (§4/§5/§15)
export { RunCaps } from "./run/run-caps.js";
export { RunConfig } from "./run/run-config.js";
export {
  type BootConfigSources,
  ConfigValidationError,
  validateBootConfig,
} from "./config/validate.js";

// Verifier (§7/§14)
export {
  CriticMandate,
  CriticMandateValues,
  CriticReview,
} from "./verifier/critic-review.js";
export { CRITIC_INPUT_DELIMITER, CriticInput } from "./verifier/critic-input.js";

// Checks (§7/§14)
export { CheckResult, CheckStatus, CheckStatusValues } from "./checks/check-result.js";
export { CheckRunnerAdapter } from "./checks/check-runner-adapter.js";

// Scoring (§8)
export { FitnessScore } from "./scoring/fitness-score.js";
export { NoveltyScore } from "./scoring/novelty-score.js";
export { ScoringPolicy } from "./scoring/scoring-policy.js";

// Reproduction (§4/§8)
export {
  EnergyEvent,
  EnergyEventType,
  EnergyEventTypeValues,
} from "./reproduction/energy-event.js";
export {
  ReproductionEvent,
  ReproductionMode,
  ReproductionModeValues,
} from "./reproduction/reproduction-event.js";
