import { z } from 'zod';

/**
 * ProjectionWatermark — the `(runId, sequence)` watermark every cached/materialized projection records
 * (ARCHITECTURE.md §9). A projection is a DERIVED, rebuildable read model: it persists the
 * `sequenceThrough` it was folded up to, so it can be discarded/rebuilt whenever `run_events` exist
 * with a sequence greater than that watermark. `sequenceThrough` mirrors `LineageGraphProjection`'s
 * watermark naming — the per-run `sequence` is the sole ordering key (§4). Strict 2-field object: no
 * physical-storage field is representable, so consumers depend on the abstract watermark only.
 */
export const ProjectionWatermark = z.strictObject({
  runId: z.string().min(1),
  sequenceThrough: z.int().nonnegative(),
});

export type ProjectionWatermark = z.infer<typeof ProjectionWatermark>;
