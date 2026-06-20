import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { buildLineageGraph } from "./lineage-graph.js";

/**
 * Derived lineage export (P6.11). Produces a JSON string the Neo4j
 * spike notebook loads via apoc.load.json. Pure read against the
 * persisted event log; never imported by runtime code.
 *
 * The export shape is verbatim LineageGraphProjection — a single
 * object with { runId, sequenceThrough, nodes, edges }. The notebook
 * is responsible for mapping into Cypher (CREATE / MERGE on nodes
 * keyed by id, then edges).
 */

export interface ExportLineageInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
}

export async function exportLineageAsJson(input: ExportLineageInput): Promise<string> {
  const { graph } = await buildLineageGraph({ db: input.db, runId: input.runId });
  return JSON.stringify(graph, null, 2);
}
