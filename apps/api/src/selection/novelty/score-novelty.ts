import { CURRENT_SCHEMA_VERSION, NoveltyScore } from '@doppl/contracts';
import type { RunEventEnvelope } from '@doppl/contracts';
import type { ModelGateway } from '../../model-gateway';
import { cosineSimilarity, noveltyFromSimilarities } from './cosine';
import { embed } from './embed';

/**
 * scoreNovelty — orchestrates novelty scoring for one candidate (P5.2, ARCHITECTURE.md §8): emit the
 * `novelty.scoring_started` marker → embed the summary → app-level cosine vs the prior-candidate
 * comparison set → build + validate the frozen `NoveltyScore` → emit `novelty.scored`. Emission goes
 * through an injected `NoveltyEmitter` seam (I/O = the frozen envelope minus the server-assigned
 * fields), so emission ordering lives INSIDE selection and the real `EventStore.append` wires in at
 * P3.
 *
 * Replay re-derives the score from the persisted vector via `cosine.ts` (rule #7 — zero gateway
 * calls); the two emitted events carry the generic marker payload + the `NoveltyScore` and never
 * debit energy (rule #8 — neither is `energy.spent`).
 */

/** A comparison candidate: its id (recorded in `comparisonSet`) + its persisted embedding vector. */
export interface NoveltyComparison {
  candidateId: string;
  vector: readonly number[];
}

export interface ScoreNoveltyInput {
  runId: string;
  generationId?: string;
  candidateId: string;
  summary: string;
  comparison: readonly NoveltyComparison[];
}

/**
 * NoveltyEmitter — the append seam. Its I/O IS the frozen `RunEventEnvelope` minus the two
 * server/DB-assigned fields (`sequence`, `occurredAt`) — structurally identical to
 * `EventStore.append`, which the P3 runtime supplies as the real implementation (LESSONS §20).
 */
export type NoveltyEmitter = (
  envelope: Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>,
) => Promise<{ sequence: number }>;

export interface ScoreNoveltyDeps {
  gateway: ModelGateway;
  emit: NoveltyEmitter;
  /** Injected id factory — keeps the scorer free of `Math.random`/uuid (byte-deterministic, §24). */
  newId: () => string;
}

const NOVELTY_METHOD = 'cosine';

export async function scoreNovelty(
  input: ScoreNoveltyInput,
  deps: ScoreNoveltyDeps,
): Promise<NoveltyScore> {
  const { runId, generationId, candidateId, summary, comparison } = input;
  const base = { runId, generationId, candidateId };

  // 1. Operation-start marker — generic payload, envelope-level correlation, NO energy debit (rule #8).
  await deps.emit({
    ...base,
    id: deps.newId(),
    type: 'novelty.scoring_started',
    actor: 'selection_controller',
    payload: {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  // 2. Embed — the only gateway call on this path.
  const embedded = await embed(summary, { gateway: deps.gateway });
  if (!embedded.ok) {
    // Transitional stub: the retry → lexical fallback → `novelty_scoring_degraded` path is P5.3,
    // which replaces this throw. Carries the failure CODE only — never the provider payload.
    throw new Error(`novelty embedding failed: ${embedded.reason}`);
  }

  // 3. App-level cosine / nearest-neighbour over the comparison set.
  const similarities = comparison.map((c) => cosineSimilarity(embedded.vector, c.vector));
  const score = noveltyFromSimilarities(similarities);
  const explanation = explainNovelty(score, similarities, comparison);

  // 4. Build + validate the frozen NoveltyScore — `.parse` so the PERSISTED value is the validated one.
  const noveltyScore = NoveltyScore.parse({
    id: deps.newId(),
    candidateId,
    vector: embedded.vector,
    embeddingModelId: embedded.embeddingModelId,
    dimension: embedded.dimension,
    comparisonSet: comparison.map((c) => c.candidateId),
    method: NOVELTY_METHOD,
    score,
    explanation,
  });

  // 5. Emit the authoritative `novelty.scored` (the NoveltyScore payload).
  await deps.emit({
    ...base,
    id: deps.newId(),
    type: 'novelty.scored',
    actor: 'selection_controller',
    payload: noveltyScore,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  return noveltyScore;
}

/**
 * explainNovelty — the audit trail (§8 "every selection decision is explainable from persisted
 * events"): names the nearest-neighbour candidateId + the comparison count for a non-empty set, or
 * states the zero-prior-candidates case for the first candidate.
 */
function explainNovelty(
  score: number,
  similarities: readonly number[],
  comparison: readonly NoveltyComparison[],
): string {
  if (comparison.length === 0) {
    return 'First candidate scored — no prior candidates in the comparison set; maximally novel (score 1).';
  }
  let maxSimilarity = -Infinity;
  let nearestId = '';
  for (const [i, c] of comparison.entries()) {
    const s = similarities[i] ?? -Infinity; // same-length by construction; default never triggers.
    if (s > maxSimilarity) {
      maxSimilarity = s;
      nearestId = c.candidateId;
    }
  }
  return (
    `Novelty ${score} = 1 − max cosine similarity ${maxSimilarity} ` +
    `over ${comparison.length} prior candidate(s); nearest neighbour ${nearestId}.`
  );
}
