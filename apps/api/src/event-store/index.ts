/**
 * event-store barrel — the authoritative persistence surface for apps/api. `createEventStore` exposes
 * the sole append path + ordered read (rule #2); the boot migrator, redaction scrub, and schema are
 * re-exported as the area surface. No mutate path is exported — the write is the only authoritative
 * mutation of `run_events`.
 */
export * from './append';
export * from './schema';
export { runMigrations } from './migrate';
export { scrubEventPayload } from './redaction';

// EvidenceRef resolver (P1.7) — pure Postgres-tier dereference, fail-closed on external pointers (rule #7).
export { resolveEvidenceRef, createEvidenceResolver } from './evidence-resolver';
export type {
  EvidenceResolution,
  EvidenceUnresolvedReason,
  EvidenceResolver,
} from './evidence-resolver';

// Replay reader + canonical serialization (P1.8) — reconstruct run state from the persisted log,
// validate-not-sort (gap/out_of_order/schema_too_new), no provider seam (rule #7 structural — lesson 30).
export { replayEvents, replayRun, createReplayReader, ReplayIntegrityError } from './replay-reader';
export type { ReplayReader, ReplayIntegrityReason } from './replay-reader';
export { canonicalSerialize } from './canonical-serialization';
