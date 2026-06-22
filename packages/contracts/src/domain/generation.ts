import { z } from 'zod';

/**
 * GenerationStatus — the CLOSED 9-member generation-lifecycle union (ARCHITECTURE.md §3/§5, Appendix
 * A). The P3 kernel drives the transitions; this freezes the status enum only. Any other value rejected.
 *
 * [P0.15-amend] `degraded` added (8→9, after `running`) so the §3 partial-failure edge
 * `running → degraded → verifying` is representable + persistable. (kernel-020 reconcile: this fold
 * lands at CURRENT_SCHEMA_VERSION 3→4 alongside CandidateStatus `repairing`; P0.16 judge took v3.)
 * Additive + backward-compatible (closure preserved — unknown statuses still rejected).
 */
export const GenerationStatus = z.enum([
  'pending',
  'running',
  'degraded',
  'verifying',
  'scoring',
  'reproducing',
  'completed',
  'failed',
  'skipped',
]);

export type GenerationStatus = z.infer<typeof GenerationStatus>;

/**
 * Generation — the per-run generation entity (ARCHITECTURE.md §3, Appendix A). Strict 6-field object
 * (5 required + `completedAt?` optional). `index` is a non-negative ordinal; monotonicity (`index`
 * increases per run) is a kernel rule (lesson §6), NOT a schema constraint. `startedAt`/`completedAt?`
 * are ISO-8601 UTC; `completedAt?` omittable until the generation completes.
 */
export const Generation = z.strictObject({
  id: z.string().min(1),
  runId: z.string().min(1),
  index: z.int().nonnegative(),
  status: GenerationStatus,
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
});

export type Generation = z.infer<typeof Generation>;
