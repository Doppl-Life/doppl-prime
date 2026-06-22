import type {
  FitnessScore,
  LineageEdge,
  LineageGraphProjection,
  LineageNode,
  NoveltyScore,
} from '@doppl/contracts';
import type { WatermarkedProjection } from './projection-builder';
import type { CurrentState } from './reducers/state';

/**
 * Lineage-graph projection builder (ARCHITECTURE.md §10/§9): a PURE transform of the P6.2 current-state
 * into the FROZEN `LineageGraphProjection` (P0.13) — never a re-fold (the events were already folded in
 * P6.2). Nodes use the frozen closed-6 `LineageNodeType`; the selected winner is a `candidate` node
 * carrying status `'selected'` (NOT a 7th type). Edges are the reproduction genealogy (the
 * `lineage_edges` rows, parent→child) PLUS structural connectivity (generation→agenome→candidate→
 * {critic,check,score}) so the rendered set is a connected React-Flow graph (§10). `dataRef` is a
 * within-tier authoritative pointer (the entity id), never an external store. `runId`/`sequenceThrough`
 * carry through from the current-state watermark. Pure — imports no provider (rule #7).
 *
 * Dangling-endpoint guard: a STRUCTURAL edge is emitted only when BOTH endpoints have nodes (an orphan
 * critic/check referencing an absent candidate yields its node but no edge to a non-existent node —
 * React Flow breaks on that). Reproduction edges come from the authoritative log and are emitted as-is
 * (a real run spawns its offspring, so their nodes exist).
 */
export function buildLineageGraph(
  projection: WatermarkedProjection<CurrentState>,
): LineageGraphProjection {
  const { runId, sequenceThrough, state } = projection;
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];

  // Index fitness/novelty by candidateId so candidate/score nodes can surface them as metrics.
  const fitnessByCandidate = new Map<string, FitnessScore>();
  for (const fitness of Object.values(state.fitnessScores)) {
    fitnessByCandidate.set(fitness.candidateId, fitness);
  }
  const noveltyByCandidate = new Map<string, NoveltyScore>();
  for (const novelty of Object.values(state.noveltyScores)) {
    noveltyByCandidate.set(novelty.candidateId, novelty);
  }

  for (const generation of Object.values(state.generations)) {
    nodes.push({
      id: generation.id,
      type: 'generation',
      label: `Generation ${generation.id}`,
      status: generation.status,
      dataRef: generation.id,
    });
  }

  for (const agenome of Object.values(state.agenomes)) {
    nodes.push({
      id: agenome.id,
      type: 'agenome',
      label: `Agenome ${agenome.id}`,
      status: agenome.status,
      dataRef: agenome.id,
    });
  }

  for (const candidate of Object.values(state.candidateIdeas)) {
    const metrics: Record<string, number> = {};
    const fitness = fitnessByCandidate.get(candidate.id);
    const novelty = noveltyByCandidate.get(candidate.id);
    if (fitness !== undefined) metrics.fitness = fitness.total;
    if (novelty !== undefined) metrics.novelty = novelty.score;
    nodes.push({
      id: candidate.id,
      type: 'candidate',
      label: candidate.title,
      status: candidate.status,
      dataRef: candidate.id,
      ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
    });
  }

  for (const review of Object.values(state.criticReviews)) {
    nodes.push({
      id: review.id,
      type: 'critic',
      label: `Critic: ${review.mandate}`,
      dataRef: review.id,
    });
  }

  for (const check of Object.values(state.checkResults)) {
    nodes.push({ id: check.id, type: 'check', label: check.checkType, dataRef: check.id });
  }

  for (const fitness of Object.values(state.fitnessScores)) {
    nodes.push({
      id: fitness.id,
      type: 'score',
      label: `Fitness ${fitness.total}`,
      metrics: { total: fitness.total },
      dataRef: fitness.id,
    });
  }

  // Structural connectivity (guarded) — emit only when both endpoint nodes exist. Edge ids are
  // KIND-PREFIXED (`struct:` here, `repro:` below) so a structural and a reproduction edge sharing the
  // same `${source}->${target}` (possible when a reproduction child id coincides with a candidate id
  // under the opaque-id space) never collide on id — React Flow breaks on duplicate edge ids.
  const nodeIds = new Set(nodes.map((node) => node.id));
  const linkStructural = (source: string, target: string, type: string): void => {
    if (nodeIds.has(source) && nodeIds.has(target)) {
      edges.push({ id: `struct:${source}->${target}`, source, target, type });
    }
  };
  for (const agenome of Object.values(state.agenomes)) {
    if (agenome.generationId !== null) linkStructural(agenome.generationId, agenome.id, 'spawned');
  }
  for (const candidate of Object.values(state.candidateIdeas)) {
    linkStructural(candidate.agenomeId, candidate.id, 'generated');
  }
  for (const review of Object.values(state.criticReviews)) {
    linkStructural(review.candidateId, review.id, 'reviewed_by');
  }
  for (const check of Object.values(state.checkResults)) {
    linkStructural(check.candidateId, check.id, 'checked_by');
  }
  for (const fitness of Object.values(state.fitnessScores)) {
    linkStructural(fitness.candidateId, fitness.id, 'scored_by');
  }

  // Reproduction genealogy — the authoritative parent→child edges, `repro:`-prefixed (see above) so
  // they never collide on id with a structural edge; the authoritative `edge.id` is carried verbatim.
  for (const edge of Object.values(state.lineageEdges)) {
    edges.push({ id: `repro:${edge.id}`, source: edge.source, target: edge.target, type: edge.type });
  }

  return { runId, nodes, edges, sequenceThrough };
}
