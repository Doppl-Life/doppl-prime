import type { CheckStatus } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { replayReader } from "../../event-store/replay-reader.js";

/**
 * Subtype-check component (P5.5, D4). Iterates `check.completed` events
 * for one candidate, excluding the held-out judge (`checkType ===
 * "final_judge"` rides on the same event type — see Phase 4 U6). Each
 * subtype set ships 5 adapters (Phase 4 U7/U8). Aggregation:
 *   (passed + 0.5 × skipped) / 5
 * `failed` contributes 0. Skipping counts half so a candidate isn't
 * penalized when its corpus lookup happens to miss (not the candidate's
 * fault).
 *
 * Range `[0, 1]`.
 */

const SUBTYPE_ADAPTER_COUNT = 5;
const FINAL_JUDGE_CHECK_TYPE = "final_judge";

interface CheckCompletedPayload {
  result?: {
    checkType?: string;
    status?: CheckStatus;
  };
}

export interface SubtypeCheckInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
  candidateId: string;
}

export async function subtypeCheckScoreForCandidate(input: SubtypeCheckInput): Promise<number> {
  let passed = 0;
  let skipped = 0;
  for await (const env of replayReader(input.db).events(input.runId)) {
    if (env.type !== "check.completed") continue;
    if (env.candidateId !== input.candidateId) continue;
    const result = (env.payload as CheckCompletedPayload).result;
    if (!result || result.checkType === FINAL_JUDGE_CHECK_TYPE) continue;
    if (result.status === "passed") passed += 1;
    else if (result.status === "skipped") skipped += 1;
  }
  return (passed + 0.5 * skipped) / SUBTYPE_ADAPTER_COUNT;
}
