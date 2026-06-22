import type { LineageGraphProjection } from '@doppl/contracts';

/**
 * P6.11 — the Neo4j lineage-export spike (ARCHITECTURE.md §10/§9). A PURE, derived-only, read-only
 * transform of the frozen P6.3 `LineageGraphProjection` into a storage-agnostic, Neo4j-importable /
 * dashboard-export shape: a `{nodes, edges, sequenceThrough}` structure the throwaway notebook
 * `LOAD`/`UNWIND`s into Neo4j. It is the LESSONS §30 secondary-projection pattern — a transform of an
 * existing projection that CARRIES the `sequenceThrough` watermark, never re-folding the event log.
 *
 * Derived + read-only (rule #2): this module imports nothing from the event-store writer / `run_events`
 * / drizzle, so it can never write back into the authoritative log or a projection. Storage-agnostic
 * (§10): it emits a NEUTRAL node/edge data structure — no Neo4j driver, no Cypher strings, no physical-
 * storage coupling leaks into `apps/api`. The export is consumed ONLY by the throwaway spike notebook
 * (and optionally a future dashboard "export lineage" action); it is NEVER a runtime dependency — the
 * demo path works with the notebook absent.
 *
 * The frozen `LineageNodeType` becomes a single PascalCase Neo4j label (e.g. `candidate` → `Candidate`);
 * status/metrics/dataRef ride along as node properties so all four Cypher query shapes are expressible:
 * ancestors-of-winner (the `selected` candidate + genealogy edges), parent-contribution, critic-kill
 * (critic node + `reviewed_by` edge + rejected status), and lineage distance/diversity (graph + novelty
 * metric). Reproduction/structural edges carry their type so the relationships survive the transform.
 */
export interface ExportNode {
  id: string;
  /** A single PascalCase Neo4j label derived from the node type. */
  labels: string[];
  /** Neutral properties: label + dataRef, plus status/metrics when present. */
  props: Record<string, unknown>;
}

export interface ExportEdge {
  id: string;
  source: string;
  target: string;
  /** The relationship type (carried verbatim from `LineageEdge.type`). */
  type: string;
  props: Record<string, unknown>;
}

export interface LineageExport {
  /** The run this export belongs to — so a multi-run notebook export identifies each run. */
  runId: string;
  nodes: ExportNode[];
  edges: ExportEdge[];
  /** The per-run sequence watermark, carried through from the projection (never re-folded). */
  sequenceThrough: number;
}

/** `candidate` → `Candidate` — the closed `LineageNodeType` as a single PascalCase Neo4j label. */
function toLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function lineageToExport(projection: LineageGraphProjection): LineageExport {
  const nodes: ExportNode[] = projection.nodes.map((node) => {
    const props: Record<string, unknown> = { label: node.label, dataRef: node.dataRef };
    if (node.status !== undefined) props.status = node.status;
    if (node.metrics !== undefined) props.metrics = node.metrics;
    return { id: node.id, labels: [toLabel(node.type)], props };
  });

  const edges: ExportEdge[] = projection.edges.map((edge) => {
    const props: Record<string, unknown> = {};
    if (edge.label !== undefined) props.label = edge.label;
    return { id: edge.id, source: edge.source, target: edge.target, type: edge.type, props };
  });

  return { runId: projection.runId, nodes, edges, sequenceThrough: projection.sequenceThrough };
}
