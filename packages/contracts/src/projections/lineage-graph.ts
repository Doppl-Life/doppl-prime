import { z } from "zod";

/**
 * LineageGraphProjection — the typed Appendix-A read model that the
 * React Flow dashboard consumes (ARCHITECTURE.md §9, DECISIONS.md ADR-008,
 * IMPLEMENTATION_PLAN.md P0.13 / P7.7).
 *
 * Storage-agnostic by design: this contract carries no concrete storage
 * fields (no SQL view name, no Neo4j label). The kernel-side projection
 * builder (P6.3) materializes it from the event log; React Flow renders
 * it with the five custom node types enumerated below.
 *
 * Per IMPLEMENTATION_PLAN.md P7.7 ("five custom node types") and
 * ARCHITECTURE.md §9 ("agenome, candidate, critic/check, score, selected
 * winner"), the five rendering categories map to the 5 schema-level
 * LineageNodeType members. "Selected winner" rendering is a styling
 * decision driven by `LineageNode.status`, not a separate node type.
 *
 * `sequenceThrough` is the projection's watermark — the highest
 * (runId, sequence) consumed from the event log. A reader compares it
 * against the run's current head sequence to detect staleness.
 */

export const LineageNodeTypeValues = [
  "agenome",
  "candidate",
  "critic_review",
  "check_result",
  "scoring",
] as const;

export const LineageNodeType = z.enum(LineageNodeTypeValues);
export type LineageNodeType = z.infer<typeof LineageNodeType>;

export const LineageNode = z
  .object({
    id: z.string().min(1),
    type: LineageNodeType,
    label: z.string(),
    status: z.string().optional(),
    metrics: z.record(z.string(), z.number()).optional(),
    dataRef: z.string().optional(),
  })
  .strict();
export type LineageNode = z.infer<typeof LineageNode>;

export const LineageEdge = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    type: z.string().min(1),
    label: z.string().optional(),
  })
  .strict();
export type LineageEdge = z.infer<typeof LineageEdge>;

export const LineageGraphProjection = z
  .object({
    runId: z.string().min(1),
    sequenceThrough: z.number().int().nonnegative(),
    nodes: z.array(LineageNode),
    edges: z.array(LineageEdge),
  })
  .strict();
export type LineageGraphProjection = z.infer<typeof LineageGraphProjection>;
