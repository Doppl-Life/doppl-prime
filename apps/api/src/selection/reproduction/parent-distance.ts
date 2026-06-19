import type { NoveltyScore } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { replayReader } from "../../event-store/replay-reader.js";
import { cosineDistance } from "../novelty/cosine.js";

/**
 * Parent-distance computation (P5.9). Reads persisted novelty.scored
 * vectors for two candidates and returns their cosine distance. Used
 * by the fuse orchestrator to apply the distant-lineage anti-collapse
 * preference: pairs with maximum distance get fused first.
 *
 * Replay-safe by construction: reads only persisted state, never
 * re-embeds.
 *
 * Returns `null` when either candidate has no persisted novelty.scored
 * vector OR when one of them is the lexical-fallback placeholder
 * (dimension 1). The caller treats `null` as "distance unknown" and
 * falls back to the natural ranking order.
 */

const LEXICAL_FALLBACK_MIN_DIM = 2;

interface NoveltyScoredPayload {
  novelty?: NoveltyScore;
}

async function findLatestNoveltyVector(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
  candidateId: string,
): Promise<{ vector: number[]; dimension: number } | null> {
  let latest: { vector: number[]; dimension: number } | null = null;
  for await (const env of replayReader(db).events(runId)) {
    if (env.type !== "novelty.scored") continue;
    if (env.candidateId !== candidateId) continue;
    const novelty = (env.payload as NoveltyScoredPayload).novelty;
    if (!novelty) continue;
    latest = { vector: novelty.vector, dimension: novelty.dimension };
  }
  return latest;
}

export interface ParentDistanceInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
  candidateIdA: string;
  candidateIdB: string;
}

export async function parentDistance(input: ParentDistanceInput): Promise<number | null> {
  const [a, b] = await Promise.all([
    findLatestNoveltyVector(input.db, input.runId, input.candidateIdA),
    findLatestNoveltyVector(input.db, input.runId, input.candidateIdB),
  ]);
  if (!a || !b) return null;
  if (a.dimension < LEXICAL_FALLBACK_MIN_DIM || b.dimension < LEXICAL_FALLBACK_MIN_DIM) {
    return null;
  }
  if (a.dimension !== b.dimension) return null;
  return cosineDistance(a.vector, b.vector);
}
