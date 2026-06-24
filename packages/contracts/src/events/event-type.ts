import { z } from 'zod';

/**
 * RunEventType — the CLOSED event registry (ARCHITECTURE.md §4 / Appendix A).
 *
 * Enumerates every lifecycle event, every failure/terminal event, plus the operation-start /
 * in-flight observability markers (§4 live in-flight window) — so no failure path in §3/§5 is
 * unrepresentable (closes RISK-006). Any unlisted type is rejected. 42 members (31 + 11 markers).
 *
 * Note: lifecycle types are dotted (`run.failed`, `run.stopped`, …) per the canonical
 * Appendix A typed registry — this is the authoritative spelling for the terminal events. The 11
 * markers (P0.1-amend) are persisted + replay-faithful (envelope-level correlation, no provider
 * call to replay) and debit NO energy (rule #8 — they are NOT `energy.spent`).
 *
 * The judge-output amendment adds ONE terminal type — `judge.reviewed` (36 → 37) — the held-out
 * judge's persisted acceptance result (narrows to `JudgeResult`; the §2.5 verifier→selection seam).
 * It is the terminal half of the existing `judge.review_started` operation-start marker. Additive +
 * non-breaking: closure (rejects-unlisted, RISK-006) is preserved and `schemaVersion` bumps 2 → 3.
 *
 * The terminal-event amendment (sv4→5) adds the 4 reachable §3/§5 terminals the registry was missing,
 * so every state-machine terminal is rule-#2 replayable (37 → 41): `run.cancelled` (configured→cancelled,
 * kill switch) + `generation.skipped` (pending→skipped, kill switch) — both NAMED by the P3.4 killSwitch
 * here — plus `agenome.failed` (active→failed; loop P3.10 emission, deferred) + `candidate.rejected`
 * (under_review→rejected; runtime-on-SELECTION-verdict, P3↔P5 seam, deferred — the verifier is
 * evidence-only, rule #6). All 4 are low-traffic → generic JSONB payload (no HIGH_TRAFFIC_PAYLOAD_MAP
 * entry). Additive + non-breaking: closure (RISK-006) preserved, `schemaVersion` bumps 4 → 5.
 */
export const RunEventType = z.enum([
  // lifecycle
  'run.configured',
  'run.started',
  'run.completed',
  'run.failed',
  'run.stopped',
  // terminal-event amendment (sv4→5): operator-cancel terminal of a configured (not-yet-running) run.
  'run.cancelled',
  'generation.started',
  'generation.completed',
  // terminal-event amendment (sv4→5): a pending generation skipped by the kill switch.
  'generation.skipped',
  'agenome.spawned',
  'agenome.fused',
  'agenome.mutated',
  'agenome.reproduced',
  'candidate.created',
  'critic.reviewed',
  'check.completed',
  // held-out judge acceptance result (judge-output amendment) — narrows to JudgeResult; terminal
  // half of the `judge.review_started` marker; the §2.5 verifier→selection seam (NOT a marker).
  'judge.reviewed',
  'novelty.scored',
  'fitness.scored',
  'lineage.culled',
  'energy.spent',
  // failure / terminal
  'provider_call_failed',
  'output_schema_rejected',
  'candidate_invalidated',
  'energy_exhausted',
  'generation_failed',
  'reproduction_aborted_insufficient_parents',
  'novelty_scoring_degraded',
  // terminal-event amendment (sv4→5): agenome active→failed terminal (loop P3.10 emission, deferred) +
  // candidate under_review→rejected terminal (runtime-on-SELECTION-verdict, P3↔P5 seam, deferred).
  'agenome.failed',
  'candidate.rejected',
  // operation-start / in-flight observability markers (P0.1-amend; §4 live in-flight window).
  // Generic payload (envelope-level correlation), NO energy debit (rule #8 — not `energy.spent`).
  'generation.verifying',
  'generation.scoring',
  'generation.reproducing',
  'candidate.generation_started',
  'critic.review_started',
  'check.started',
  'novelty.scoring_started',
  'judge.review_started',
  'fusion.started',
  'tool_call.started',
  'tool_call.finished',
  // frontend-v2 FB.6 (sv6→7): deep-telemetry capture of a successful generation LLM call's raw response
  // (+ reasoning where surfaced). High-traffic → narrows to LlmCallTelemetry; scrubbed at the persistence
  // boundary (rule #4), truncated-with-marker under the ceiling, replay-read (rule #7). NOT a marker.
  'llm_call_telemetry',
]);

export type RunEventType = z.infer<typeof RunEventType>;
