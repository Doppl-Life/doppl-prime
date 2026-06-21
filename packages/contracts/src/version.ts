/**
 * CURRENT_SCHEMA_VERSION — the `schemaVersion` the registry pins as current.
 *
 * Every {@link RunEventEnvelope} carries a `schemaVersion`. Readers accept all `schemaVersion ≤ current`
 * (the replay reader, P1.8, rejects `> current`); the contract itself only requires a positive int.
 *
 * Version history (each bump is the deliberate, snapshot-pinned signal that a closed set changed):
 *  - 1 → 2 (P0.1-amend): +11 operation-start markers extended the `RunEventType` registry.
 *  - 2 → 3 (P0.15-amend): +`degraded` extended the `GenerationStatus` enum (§3 partial-failure edge).
 * Every bump is ADDITIVE + forward-compatible — old `schemaVersion` 1/2 envelopes still validate (the
 * contract accepts any positive int; the `≤ current` ceiling is the reader's job).
 */
export const CURRENT_SCHEMA_VERSION = 3;
