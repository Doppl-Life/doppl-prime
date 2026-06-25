import { z } from 'zod';

/**
 * LineageNodeType — the CLOSED 6-member lineage-node-type union (ARCHITECTURE.md §10 / DATA_MODEL.md),
 * mirroring the frozen lineage entities. The frontend (P7) renders a custom React Flow node per type.
 * Any other value rejected.
 */
export const LineageNodeType = z.enum([
  'generation',
  'agenome',
  'candidate',
  'critic',
  'check',
  'score',
]);

export type LineageNodeType = z.infer<typeof LineageNodeType>;

/**
 * LineageNode — a single node in the lineage graph (ARCHITECTURE.md §10). Strict 7-field object (4
 * required + `status?`/`metrics?`/`generationIndex?` optional). `dataRef` is an opaque pointer to the
 * authoritative event/entity (resolution is the projection-builder's job, §9 — same authoritative-ref-
 * by-id posture as `EvidenceRef`); `metrics?` is an open name→number record; `status?` is an open string
 * (node status varies by node type, so it is NOT a single closed union). `generationIndex?` is the
 * zero-based generation ordinal the node belongs to — additive + optional (a derived projection field, so
 * no schemaVersion implication; old projections without it still parse). The renderer buckets nodes into
 * per-generation COLUMNS by this ordinal (a tool an auto-layout can't infer from topology alone).
 */
export const LineageNode = z.strictObject({
  id: z.string().min(1),
  type: LineageNodeType,
  label: z.string().min(1),
  status: z.string().min(1).optional(),
  metrics: z.record(z.string(), z.number()).optional(),
  generationIndex: z.int().nonnegative().optional(),
  dataRef: z.string().min(1),
});

export type LineageNode = z.infer<typeof LineageNode>;

/**
 * LineageEdge — a directed edge between two lineage nodes (ARCHITECTURE.md §10). Strict 5-field object
 * (4 required + `label?` optional). `source`/`target` reference node ids; `type` labels the relation.
 */
export const LineageEdge = z.strictObject({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.string().min(1),
  label: z.string().min(1).optional(),
});

export type LineageEdge = z.infer<typeof LineageEdge>;

/**
 * LineageGraphProjection — the storage-agnostic lineage graph (ARCHITECTURE.md §9/§10, Appendix A).
 * Strict 4-field object — a DERIVED, rebuildable projection. `sequenceThrough` is the per-run sequence
 * watermark the projection was built through (§9 — so it is discardable/rebuildable when newer events
 * exist). It carries NO physical-storage/Neo4j field (the strict object rejects one), so consumers
 * depend on this abstract shape only, never on the physical store.
 */
export const LineageGraphProjection = z.strictObject({
  runId: z.string().min(1),
  nodes: z.array(LineageNode),
  edges: z.array(LineageEdge),
  sequenceThrough: z.int().nonnegative(),
});

export type LineageGraphProjection = z.infer<typeof LineageGraphProjection>;
