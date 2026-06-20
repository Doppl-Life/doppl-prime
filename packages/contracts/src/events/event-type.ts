import { z } from 'zod';

/**
 * RunEventType — the CLOSED event registry (ARCHITECTURE.md §4 / Appendix A).
 *
 * Enumerates every lifecycle event plus every failure/terminal event, so no failure path
 * in §3/§5 is unrepresentable (closes RISK-006). Any unlisted type is rejected. 25 members.
 *
 * Note: lifecycle types are dotted (`run.failed`, `run.stopped`, …) per the canonical
 * Appendix A typed registry — this is the authoritative spelling for the terminal events.
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
]);

export type RunEventType = z.infer<typeof RunEventType>;
