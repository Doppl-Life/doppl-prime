/**
 * CURRENT_SCHEMA_VERSION — the `schemaVersion` the registry pins as current.
 *
 * Every {@link RunEventEnvelope} carries a `schemaVersion`. Phase-1 readers accept all
 * `schemaVersion ≤ current`; that reader logic lands with the event store. This slice only
 * pins the constant (ARCHITECTURE.md §4).
 *
 * Bumped 1 → 2 by P0.1-amend (the 11 operation-start markers extended the `RunEventType` registry).
 * Old `schemaVersion: 1` envelopes still validate (the bump is forward-compatible — readers accept
 * `≤ current`); the bump is the deliberate, snapshot-pinned signal that the registry changed.
 */
export const CURRENT_SCHEMA_VERSION = 2;
