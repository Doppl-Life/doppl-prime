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
