import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { replayReader } from "../../event-store/replay-reader.js";

/**
 * Judge-acceptance component (P5.5, D4). Finds the held-out judge's
 * `check.completed{result.checkType === "final_judge"}` event for one
 * candidate (Phase 4 U6 ships the judge result on this event with the
 * weighted total in `result.score`, axes in `result.output.axes`) and
 * returns `result.score / 25` so the component lands in `[0, 1]`.
 *
 * Returns `null` when no judge event is present for this candidate.
 * The caller (U5 fitness scorer) treats `null` as "not scored as
 * accepted by default" — the candidate's components map omits the
 * judge_acceptance entry and the explanation notes "judge: not
 * present".
 */

const FINAL_JUDGE_CHECK_TYPE = "final_judge";
const JUDGE_MAX_TOTAL = 25;

interface CheckCompletedPayload {
  result?: {
    checkType?: string;
    score?: number;
  };
}

export interface JudgeAcceptanceInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
  candidateId: string;
}

export async function judgeAcceptanceForCandidate(
  input: JudgeAcceptanceInput,
): Promise<number | null> {
  let latest: number | null = null;
  for await (const env of replayReader(input.db).events(input.runId)) {
    if (env.type !== "check.completed") continue;
    if (env.candidateId !== input.candidateId) continue;
    const result = (env.payload as CheckCompletedPayload).result;
    if (!result || result.checkType !== FINAL_JUDGE_CHECK_TYPE) continue;
    if (typeof result.score !== "number") continue;
    latest = result.score / JUDGE_MAX_TOTAL;
  }
  return latest;
}
