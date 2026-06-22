import { CURRENT_SCHEMA_VERSION, NoveltyScore } from '@doppl/contracts';
import type { RunEventEnvelope } from '@doppl/contracts';
import type { ModelGateway } from '../../model-gateway';
import { cosineSimilarity, noveltyFromSimilarities } from './cosine';
import { lexicalNoveltyScore } from './lexical-fallback';
import { embed } from './embed';

/**
 * scoreNovelty — orchestrates novelty scoring for one candidate (P5.2 + P5.3, ARCHITECTURE.md §8):
 * emit the `novelty.scoring_started` marker → embed the summary → app-level cosine vs the
 * prior-candidate comparison set → build + validate the frozen `NoveltyScore` → emit `novelty.scored`.
 * Emission goes through an injected `NoveltyEmitter` seam (I/O = the frozen envelope minus the
 * server-assigned fields), so emission ordering lives INSIDE selection and the real
 * `EventStore.append` wires in at P3.
 *
 * P5.3 degrade path: on embed failure, fall back to the deterministic lexical method and emit
 * `novelty_scoring_degraded` carrying the estimate (NOT `novelty.scored` — the frozen `NoveltyScore`
 * requires a real embedding vector the lexical path lacks). Never blocks, never silent-zeros, and is
 * replay-faithful (the lexical estimate is pure over persisted summaries).
 *
 * Replay re-derives the score from the persisted vector via `cosine.ts` / the lexical method (rule #7
 * — zero gateway calls); no emitted event is `energy.spent` (rule #8).
 */

/**
 * A comparison candidate: its id (recorded in `comparisonSet`), its persisted embedding `vector` (the
 * cosine happy path), and its `summary` text (the lexical degrade path) — both from persisted prior
 * candidates.
 */
export interface NoveltyComparison {
  candidateId: string;
  vector: readonly number[];
  summary: string;
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

/**
 * ScoreNoveltyResult — the discriminated outcome. The happy path carries the authoritative
 * `NoveltyScore`; the degrade path (P5.3) carries the lexical ESTIMATE + the fallback method + the
 * embed-failure reason (no `NoveltyScore` — the estimate has no embedding vector and rides
 * `novelty_scoring_degraded`).
 */
export type ScoreNoveltyResult =
  | { degraded: false; noveltyScore: NoveltyScore }
  | { degraded: true; estimatedScore: number; method: string; reason: string };

const NOVELTY_METHOD = 'cosine';
const LEXICAL_METHOD = 'lexical_jaccard';

export async function scoreNovelty(
  input: ScoreNoveltyInput,
  deps: ScoreNoveltyDeps,
): Promise<ScoreNoveltyResult> {
  const { runId, generationId, candidateId, summary, comparison } = input;
  const base = { runId, generationId, candidateId };

  // 1. Operation-start marker — generic payload, envelope-level correlation, NO energy debit (rule #8).
  //    Fires on BOTH terminal paths (→ novelty.scored OR → novelty_scoring_degraded).
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
    // P5.3 degrade path: deterministic lexical fallback over persisted summaries. Never block, never
    // silent-zero (the estimate is flagged via method ≠ cosine), replay-faithful (no gateway call).
    const estimatedScore = lexicalNoveltyScore(
      summary,
      comparison.map((c) => c.summary),
    );
    const reason = embedded.reason;
    await deps.emit({
      ...base,
      id: deps.newId(),
      type: 'novelty_scoring_degraded',
      actor: 'selection_controller',
      payload: { candidateId, reason, method: LEXICAL_METHOD, estimatedScore },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    return { degraded: true, estimatedScore, method: LEXICAL_METHOD, reason };
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

  return { degraded: false, noveltyScore };
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
