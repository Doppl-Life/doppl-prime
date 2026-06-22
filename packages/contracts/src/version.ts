/**
 * CURRENT_SCHEMA_VERSION — the `schemaVersion` the registry pins as current.
 *
 * Every {@link RunEventEnvelope} carries a `schemaVersion`. Readers accept all `schemaVersion ≤ current`
 * (the replay reader, P1.8, rejects `> current`); the contract itself only requires a positive int.
 *
 * Version history (each bump is the deliberate, snapshot-pinned signal that a closed set changed).
 * The cross-track reconciliation (kernel-020) linearized two independently-numbered lines onto ONE
 * monotonic counter — judge (cody's P0.16) takes v3; the kernel's two status amendments fold together
 * into v4:
 *  - 1 → 2 (P0.1-amend): +11 operation-start markers extended the `RunEventType` registry.
 *  - 2 → 3 (P0.16, judge-output amendment): +`judge.reviewed` terminal type + the `JudgeResult`
 *    narrowing extended the registry + the per-type payload map (§7/§8 verifier→selection seam).
 *  - 3 → 4 (kernel P0.15-amend + P0.5-amend, folded): +`degraded` (`GenerationStatus`, §3
 *    partial-failure edge) and +`repairing` (`CandidateStatus`, §3 structured-output repair edge).
 * Every bump is ADDITIVE + forward-compatible — old `schemaVersion` 1/2/3 envelopes still validate (the
 * contract accepts any positive int; the `≤ current` ceiling is the reader's job).
 */
export const CURRENT_SCHEMA_VERSION = 4;
