import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { RunConfig } from '@doppl/contracts';
import type { EventStore } from '../event-store';
import {
  outerBloomArtifacts,
  outerBloomHiddenNodes,
  outerCampaignArtifacts,
  outerCampaigns,
} from '../event-store/schema';
import type { ModelRouteOverrideAllowlist } from '../model-gateway/model-route-override';
import { syncOuterCampaignPromotions } from '../outer-campaigns/promotion';
import {
  buildOuterBloom,
  buildOuterBloomForRun,
  type OuterBloomIsland,
  type OuterBloomNode,
} from '../projections/outer-bloom';
import { listRunIds } from '../projections/run-list';

export interface OuterBloomRoutesDeps {
  store: EventStore;
  db: NodePgDatabase;
  newId: () => string;
  defaultConfig: RunConfig;
  modelRouteOverrideAllowlist: ModelRouteOverrideAllowlist;
  onRunConfigured?: (runId: string) => void;
}

export function registerOuterBloomRoutes(app: FastifyInstance, deps: OuterBloomRoutesDeps): void {
  app.get('/bloom', async () => {
    await syncOuterCampaignPromotions(deps);
    const hiddenByRun = await readHiddenOuterBloomNodeIds(deps.db);
    const campaignBloom = await readCampaignOuterBloom(deps.db);
    const imported = (await readImportedOuterBloom(deps.db))
      .map((island) =>
        filterOuterBloomIslandByHiddenRoots(island, hiddenByRun.get(island.runId) ?? new Set()),
      )
      .filter((island): island is OuterBloomIsland => island !== null);
    const runIdsProjectedByFirstClassOuterState = new Set([
      ...imported.map((island) => island.runId),
      ...campaignBloom.sourceRunIds,
    ]);

    const ids = await listRunIds(deps.db);
    const islands = [...campaignBloom.islands, ...imported];
    for (const id of ids) {
      if (runIdsProjectedByFirstClassOuterState.has(id)) continue;
      const events = await deps.store.readByRun(id);
      if (events.length === 0) continue;
      const island = filterOuterBloomIslandByHiddenRoots(
        buildOuterBloomForRun(events),
        hiddenByRun.get(id) ?? new Set(),
      );
      if (island !== null) islands.push(island);
    }
    return buildOuterBloom(islands);
  });

  app.delete('/bloom/nodes/:id', async (request, reply) => {
    const nodeId = (request.params as { id: string }).id;
    const [root] = await deps.db
      .select()
      .from(outerBloomArtifacts)
      .where(eq(outerBloomArtifacts.id, nodeId))
      .limit(1);

    if (root === undefined) {
      const liveDelete = await hideLiveOuterBloomSubtree(deps, nodeId);
      if (liveDelete === null) {
        return reply.status(404).send({
          error: 'outer_bloom_node_not_found',
          message: 'No imported or live Agarden projection node matched this id.',
          nodeId,
        });
      }
      return reply.send(liveDelete);
    }

    const rows = await deps.db
      .select()
      .from(outerBloomArtifacts)
      .where(eq(outerBloomArtifacts.runId, root.runId));
    const nodeIds = collectOuterBloomSubtreeIds(nodeId, rows);
    if (nodeIds.length > 0) {
      await deps.db.delete(outerBloomArtifacts).where(inArray(outerBloomArtifacts.id, nodeIds));
    }

    return reply.send({ nodeId, deleted: nodeIds.length, nodeIds, mode: 'deleted' });
  });
}

type ImportedOuterBloomRow = typeof outerBloomArtifacts.$inferSelect;
type HiddenOuterBloomRow = typeof outerBloomHiddenNodes.$inferSelect;
type CampaignOuterArtifactRow = typeof outerCampaignArtifacts.$inferSelect;
type CampaignRow = typeof outerCampaigns.$inferSelect;

export function collectOuterBloomSubtreeIds(
  rootId: string,
  rows: readonly Pick<ImportedOuterBloomRow, 'id' | 'parentId'>[],
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    childrenByParent.set(row.parentId, [...(childrenByParent.get(row.parentId) ?? []), row.id]);
  }

  const found = rows.some((row) => row.id === rootId);
  if (!found) return [];

  const ordered: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
    const children = childrenByParent.get(id) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index] as string);
    }
  }
  return ordered;
}

export function filterOuterBloomIslandByHiddenRoots(
  island: OuterBloomIsland,
  hiddenRootIds: ReadonlySet<string>,
): OuterBloomIsland | null {
  if (hiddenRootIds.size === 0) return island;

  const hidden = new Set<string>();
  for (const rootId of hiddenRootIds) {
    for (const id of collectOuterBloomSubtreeIds(rootId, island.nodes)) {
      hidden.add(id);
    }
  }
  if (hidden.size === 0) return island;

  const nodes = island.nodes.filter((node) => !hidden.has(node.id));
  if (nodes.length === 0) return null;
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const edges = island.edges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
  );
  return { ...island, nodes, edges };
}

async function hideLiveOuterBloomSubtree(
  deps: OuterBloomRoutesDeps,
  nodeId: string,
): Promise<{ nodeId: string; deleted: number; nodeIds: string[]; mode: 'hidden' } | null> {
  const importedRunIds = new Set(
    (await readImportedOuterBloom(deps.db)).map((island) => island.runId),
  );
  const ids = await listRunIds(deps.db);
  for (const runId of ids) {
    if (importedRunIds.has(runId)) continue;
    const events = await deps.store.readByRun(runId);
    if (events.length === 0) continue;
    const island = buildOuterBloomForRun(events);
    const nodeIds = collectOuterBloomSubtreeIds(nodeId, island.nodes);
    if (nodeIds.length === 0) continue;

    await deps.db
      .insert(outerBloomHiddenNodes)
      .values(
        nodeIds.map((hiddenNodeId) => ({
          id: randomUUID(),
          runId,
          nodeId: hiddenNodeId,
        })),
      )
      .onConflictDoNothing({
        target: [outerBloomHiddenNodes.runId, outerBloomHiddenNodes.nodeId],
      });

    return { nodeId, deleted: nodeIds.length, nodeIds, mode: 'hidden' };
  }
  return null;
}

async function readHiddenOuterBloomNodeIds(db: NodePgDatabase): Promise<Map<string, Set<string>>> {
  const rows: HiddenOuterBloomRow[] = await db.select().from(outerBloomHiddenNodes);
  const byRun = new Map<string, Set<string>>();
  for (const row of rows) {
    const existing = byRun.get(row.runId) ?? new Set<string>();
    existing.add(row.nodeId);
    byRun.set(row.runId, existing);
  }
  return byRun;
}

async function readImportedOuterBloom(db: NodePgDatabase): Promise<OuterBloomIsland[]> {
  const rows = await db
    .select()
    .from(outerBloomArtifacts)
    .orderBy(outerBloomArtifacts.runId, outerBloomArtifacts.sequence);
  if (rows.length === 0) return [];

  const byRun = new Map<string, ImportedOuterBloomRow[]>();
  for (const row of rows) {
    byRun.set(row.runId, [...(byRun.get(row.runId) ?? []), row]);
  }

  return [...byRun.entries()].map(([runId, runRows]) => importedRowsToIsland(runId, runRows));
}

async function readCampaignOuterBloom(
  db: NodePgDatabase,
): Promise<{ islands: OuterBloomIsland[]; sourceRunIds: Set<string> }> {
  const campaigns: CampaignRow[] = await db.select().from(outerCampaigns);
  if (campaigns.length === 0) return { islands: [], sourceRunIds: new Set() };

  const artifacts: CampaignOuterArtifactRow[] = await db
    .select()
    .from(outerCampaignArtifacts)
    .orderBy(outerCampaignArtifacts.campaignId, outerCampaignArtifacts.createdAt);

  const byCampaign = new Map<string, CampaignOuterArtifactRow[]>();
  const sourceRunIds = new Set<string>();
  for (const row of artifacts) {
    byCampaign.set(row.campaignId, [...(byCampaign.get(row.campaignId) ?? []), row]);
    if (row.sourceRunId !== null) sourceRunIds.add(row.sourceRunId);
  }

  const islands = campaigns
    .map((campaign) => campaignRowsToIsland(campaign, byCampaign.get(campaign.id) ?? []))
    .filter((island): island is OuterBloomIsland => island !== null);
  return { islands, sourceRunIds };
}

function campaignRowsToIsland(
  campaign: CampaignRow,
  rows: readonly CampaignOuterArtifactRow[],
): OuterBloomIsland | null {
  if (rows.length === 0) return null;
  const nodes = rows.map(campaignArtifactRowToNode);
  const edges = nodes
    .filter((node) => node.parentId !== null)
    .map((node) => ({
      id: `${node.parentId}->${node.id}`,
      source: node.parentId as string,
      target: node.id,
      type:
        node.stage === 'problem_recovery'
          ? 'recovered'
          : node.stage === 'case_study'
            ? 'reseeded'
            : 'solved_by',
    }));
  const maxSequence = Math.max(
    0,
    ...rows.map((row) => row.sourceSequenceThrough ?? 0),
  );
  return {
    runId: campaign.id,
    seed: campaign.synopsis || campaign.title,
    status: campaign.status,
    sequenceThrough: maxSequence,
    nodes,
    edges,
  };
}

function campaignArtifactRowToNode(row: CampaignOuterArtifactRow): OuterBloomNode {
  return {
    id: row.id,
    runId: row.sourceRunId ?? row.campaignId,
    stage: row.stage === 'case_study' || row.stage === 'problem_recovery' ? row.stage : 'doppl',
    label: row.label,
    summary: row.summary,
    status: row.status,
    parentId: row.parentArtifactId,
    generationIndex: null,
    score: row.score,
    novelty: row.novelty,
    judgeAcceptance: row.judgeAcceptance,
    sourceId: row.sourceCandidateId ?? row.sourceRunId,
    agenomeId: null,
  };
}

function importedRowsToIsland(
  runId: string,
  rows: readonly ImportedOuterBloomRow[],
): OuterBloomIsland {
  const nodes = rows.map(importedRowToNode);
  const edges = nodes
    .filter((node) => node.parentId !== null)
    .map((node) => ({
      id: `${node.parentId}->${node.id}`,
      source: node.parentId as string,
      target: node.id,
      type:
        node.stage === 'problem_recovery'
          ? 'recovered'
          : node.stage === 'case_study'
            ? 'reseeded'
            : 'solved_by',
    }));
  const root =
    nodes.find((node) => node.parentId === null) ??
    nodes.find((node) => node.stage === 'case_study') ??
    nodes[0];
  return {
    runId,
    seed: root?.summary ?? runId,
    status: 'imported',
    sequenceThrough: Math.max(...rows.map((row) => row.sequence)),
    nodes,
    edges,
  };
}

function importedRowToNode(row: ImportedOuterBloomRow): OuterBloomNode {
  return {
    id: row.id,
    runId: row.runId,
    stage: row.stage === 'case_study' || row.stage === 'problem_recovery' ? row.stage : 'doppl',
    label: row.label,
    summary: row.summary,
    status: row.status,
    parentId: row.parentId,
    generationIndex: row.generationIndex,
    score: row.score,
    novelty: row.novelty,
    judgeAcceptance: row.judgeAcceptance,
    sourceId: row.sourceId,
    agenomeId: row.agenomeId,
  };
}
