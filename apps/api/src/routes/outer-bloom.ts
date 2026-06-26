import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { EventStore } from '../event-store';
import { outerBloomArtifacts } from '../event-store/schema';
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
}

export function registerOuterBloomRoutes(app: FastifyInstance, deps: OuterBloomRoutesDeps): void {
  app.get('/bloom', async () => {
    const imported = await readImportedOuterBloom(deps.db);
    const importedRunIds = new Set(imported.map((island) => island.runId));

    const ids = await listRunIds(deps.db);
    const islands = [...imported];
    for (const id of ids) {
      if (importedRunIds.has(id)) continue;
      const events = await deps.store.readByRun(id);
      if (events.length === 0) continue;
      islands.push(buildOuterBloomForRun(events));
    }
    return buildOuterBloom(islands);
  });
}

type ImportedOuterBloomRow = typeof outerBloomArtifacts.$inferSelect;

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

function importedRowsToIsland(runId: string, rows: readonly ImportedOuterBloomRow[]): OuterBloomIsland {
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
