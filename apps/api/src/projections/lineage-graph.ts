import type { LineageEdge, LineageGraphProjection, LineageNode } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { buildCurrentState } from "./current-state.js";

/**
 * LineageGraphProjection builder (P6.3). Reuses the U2 current-state
 * projection to materialize the typed read model React Flow consumes.
 *
 * Node types (frozen at Phase 0 to 5 members): agenome, candidate,
 * critic_review, check_result, scoring. The "selected winner" rendering
 * is a styling decision driven by LineageNode.status, not its own type.
 *
 * Edges encode parent/lineage relationships from agenome.fused /
 * agenome.mutated payloads + the candidate→agenome / review→candidate /
 * check→candidate / scoring→candidate associations.
 *
 * sequenceThrough equals the highest run_events sequence consumed —
 * the watermark consumers use to detect staleness.
 *
 * dataRef is a Postgres-tier pointer (the entity id). Edge ids are
 * deterministic `source__type__target` strings.
 */

export interface BuildLineageGraphInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
}

export interface BuiltLineageGraph {
  graph: LineageGraphProjection;
  sequenceThrough: number;
}

function pushNode(nodes: LineageNode[], node: LineageNode): void {
  nodes.push(node);
}

function pushEdge(edges: LineageEdge[], edge: LineageEdge): void {
  edges.push(edge);
}

export async function buildLineageGraph(input: BuildLineageGraphInput): Promise<BuiltLineageGraph> {
  const { state, sequenceThrough } = await buildCurrentState({
    db: input.db,
    runId: input.runId,
  });

  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];

  // Agenome nodes
  for (const id of Object.keys(state.agenomes).sort()) {
    const a = state.agenomes[id];
    if (!a) continue;
    pushNode(nodes, {
      id,
      type: "agenome",
      label: id,
      ...(a.status ? { status: a.status } : {}),
      dataRef: id,
    });
  }

  // Candidate nodes + ownership edges
  for (const id of Object.keys(state.candidates).sort()) {
    const c = state.candidates[id];
    if (!c) continue;
    pushNode(nodes, {
      id,
      type: "candidate",
      label: id,
      ...(c.status ? { status: c.status } : {}),
      dataRef: id,
    });
    pushEdge(edges, {
      id: `${c.agenomeId}__owns_candidate__${id}`,
      source: c.agenomeId,
      target: id,
      type: "owns_candidate",
    });
  }

  // Critic review nodes + edges
  for (const id of Object.keys(state.criticReviews).sort()) {
    const r = state.criticReviews[id];
    if (!r) continue;
    pushNode(nodes, {
      id,
      type: "critic_review",
      label: r.mandate,
      metrics: { confidence: r.confidence },
      dataRef: id,
    });
    pushEdge(edges, {
      id: `${id}__reviews__${r.candidateId}`,
      source: id,
      target: r.candidateId,
      type: "reviews",
    });
  }

  // Check result nodes + edges
  for (const id of Object.keys(state.checkResults).sort()) {
    const c = state.checkResults[id];
    if (!c) continue;
    pushNode(nodes, {
      id,
      type: "check_result",
      label: c.checkType,
      status: c.status,
      ...(c.score !== undefined ? { metrics: { score: c.score } } : {}),
      dataRef: id,
    });
    pushEdge(edges, {
      id: `${id}__checks__${c.candidateId}`,
      source: id,
      target: c.candidateId,
      type: "checks",
    });
  }

  // Fitness scoring nodes + edges
  for (const id of Object.keys(state.fitnessScores).sort()) {
    const f = state.fitnessScores[id];
    if (!f) continue;
    pushNode(nodes, {
      id,
      type: "scoring",
      label: `fitness:${f.policyVersion}`,
      metrics: { total: f.total },
      dataRef: id,
    });
    pushEdge(edges, {
      id: `${id}__scores__${f.candidateId}`,
      source: id,
      target: f.candidateId,
      type: "scores",
    });
  }

  // Agenome lineage edges (parent → child)
  for (const e of state.lineageEdges) {
    pushEdge(edges, {
      id: `${e.source}__${e.mode}__${e.target}`,
      source: e.source,
      target: e.target,
      type: "lineage",
      label: e.mode,
    });
  }

  return {
    graph: {
      runId: input.runId,
      sequenceThrough,
      nodes,
      edges,
    },
    sequenceThrough,
  };
}
