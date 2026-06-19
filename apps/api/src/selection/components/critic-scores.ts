import { type CriticMandate, CriticMandateValues } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { replayReader } from "../../event-store/replay-reader.js";

/**
 * Critic-score component (P5.5, D4). Iterates `critic.reviewed` events
 * for one candidate, builds a map of mandate → confidence, and returns
 * the arithmetic mean over the 5 CriticMandate values. Missing /
 * rejected mandates count as 0 — the Phase 4 safety pin: a rejected
 * critic cannot silently pass.
 *
 * Range `[0, 1]`. Multiple reviewed events for the same mandate keep
 * the LAST persisted value (the closed event registry permits
 * re-reviewing if the kernel ever needs to).
 */

interface CriticReviewedPayload {
  review?: {
    mandate?: CriticMandate;
    confidence?: number;
  };
}

export interface CriticScoreInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
  candidateId: string;
}

export async function criticScoreForCandidate(input: CriticScoreInput): Promise<number> {
  const byMandate = new Map<CriticMandate, number>();
  for await (const env of replayReader(input.db).events(input.runId)) {
    if (env.type !== "critic.reviewed") continue;
    if (env.candidateId !== input.candidateId) continue;
    const review = (env.payload as CriticReviewedPayload).review;
    if (!review?.mandate || typeof review.confidence !== "number") continue;
    byMandate.set(review.mandate, review.confidence);
  }
  let sum = 0;
  for (const m of CriticMandateValues) {
    sum += byMandate.get(m) ?? 0;
  }
  return sum / CriticMandateValues.length;
}
