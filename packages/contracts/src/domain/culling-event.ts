import { z } from 'zod';

/**
 * CullingEvent — the persisted shape behind the `lineage.culled` event type (ARCHITECTURE.md §3/§8,
 * Appendix A). Strict 6-field object.
 *
 * KEY §8 (selection decisions explainable from persisted events): `scoreSnapshot` carries the scores
 * that JUSTIFIED the cull as an inspectable open `record<string, number>` (candidate/signal → score) —
 * NOT `z.unknown()`, so the decision is reconstructable from the event alone. The schema encodes SHAPE
 * only: `targetIds` COUNT (≥1) is a kernel rule (lesson §6); each target id is a `.min(1)` non-empty
 * string. The selection track (P5) is the producer of these events.
 */
export const CullingEvent = z.strictObject({
  id: z.string().min(1),
  runId: z.string().min(1),
  generationId: z.string().min(1),
  targetIds: z.array(z.string().min(1)),
  reason: z.string().min(1),
  scoreSnapshot: z.record(z.string(), z.number()),
});

export type CullingEvent = z.infer<typeof CullingEvent>;
