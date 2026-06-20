/**
 * CURRENT_SCHEMA_VERSION — the `schemaVersion` the registry pins as current.
 *
 * Every {@link RunEventEnvelope} carries a `schemaVersion`. Phase-1 readers accept all
 * `schemaVersion ≤ current`; that reader logic lands with the event store. This slice only
 * pins the constant (ARCHITECTURE.md §4).
 */
export const CURRENT_SCHEMA_VERSION = 1;
