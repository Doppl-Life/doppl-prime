import type { ScoringPolicy } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { appendEvent } from "../event-store/append.js";
import type { ModelGateway } from "../model-gateway/gateway.js";
import type { PersistedCandidate } from "../runtime/generation-loop.js";
import { SCORING_POLICY_V1 } from "./fitness/policy.js";
import { scoreFitness } from "./fitness/score-fitness.js";
import { type ComparisonEntry, scoreCandidateNovelty } from "./novelty/score-novelty.js";

/**
 * `makeScoreHook` (P5.11 bridge) — bridges Phase 5 into Phase 3's
 * `runGeneration.deps.scoreHook` injection point. The returned closure
 * matches `(candidates: PersistedCandidate[]) => Promise<void>`.
 *
 * For each candidate the closure:
 *   1. Scores novelty (U1 + U2 degrade edge) against the per-
 *      generation comparison set built from already-scored candidates.
 *   2. Scores fitness (U5) reading critic + subtype + judge + energy
 *      from the persisted event log.
 *
 * Replay-symmetric by construction: every dependency is read from the
 * persisted log, and the gateway is the only non-deterministic input
 * (which the Phase 2 RecordedGateway makes deterministic for CI).
 */

export interface MakeScoreHookDeps {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  gateway: ModelGateway;
  runId: string;
  policy?: ScoringPolicy;
  getCurrentGenerationIndex: () => number;
}

export type ScoreHook = (candidates: PersistedCandidate[]) => Promise<void>;

function candidateText(c: PersistedCandidate): string {
  if (typeof c.rawOutput === "object" && c.rawOutput !== null) {
    const shape = c.rawOutput as { summary?: unknown; text?: unknown };
    if (typeof shape.summary === "string") return shape.summary;
    if (typeof shape.text === "string") return shape.text;
  }
  if (typeof c.rawOutput === "string") return c.rawOutput;
  try {
    return JSON.stringify(c.rawOutput);
  } catch {
    return String(c.rawOutput);
  }
}

export function makeScoreHook(deps: MakeScoreHookDeps): ScoreHook {
  const policy = deps.policy ?? SCORING_POLICY_V1;
  const appendBound = (input: Parameters<typeof appendEvent>[1]) => appendEvent(deps.db, input);

  return async (candidates: PersistedCandidate[]) => {
    if (candidates.length === 0) return;
    const generationIndex = deps.getCurrentGenerationIndex();
    const generationId = `gen_${generationIndex}`;
    const comparison: ComparisonEntry[] = [];

    for (const candidate of candidates) {
      const text = candidateText(candidate);
      const noveltyOut = await scoreCandidateNovelty({
        gateway: deps.gateway,
        appendEvent: appendBound,
        candidateId: candidate.candidateId,
        candidateText: text,
        runId: deps.runId,
        correlationId: `score_${candidate.candidateId}_novelty`,
        generationId,
        agenomeId: candidate.agenomeId,
        comparison,
      });

      await scoreFitness({
        db: deps.db,
        appendEvent: appendBound,
        runId: deps.runId,
        candidateId: candidate.candidateId,
        agenomeId: candidate.agenomeId,
        novelty: noveltyOut.noveltyScore,
        policy,
        correlationId: `score_${candidate.candidateId}_fitness`,
        generationId,
      });

      comparison.push({
        candidateId: candidate.candidateId,
        vector: noveltyOut.vector,
        text,
      });
    }
  };
}
