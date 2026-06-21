import { z } from 'zod';

/**
 * RunEventType — the CLOSED event registry (ARCHITECTURE.md §4 / Appendix A).
 *
 * Enumerates every lifecycle event, every failure/terminal event, plus the operation-start /
 * in-flight observability markers (§4 live in-flight window) — so no failure path in §3/§5 is
 * unrepresentable (closes RISK-006). Any unlisted type is rejected. 37 members (26 + 11 markers).
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
 */
export const RunEventType = z.enum([
  // lifecycle
  'run.configured',
  'run.started',
  'run.completed',
  'run.failed',
  'run.stopped',
  'generation.started',
  'generation.completed',
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
]);

export type RunEventType = z.infer<typeof RunEventType>;
