import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { type CurrentState, buildCurrentState } from "./current-state.js";

/**
 * Replay-summary projection (P6.4). Pure transform of current-state
 * into a summary the demo's "replay" tab renders. Reads only persisted
 * state — no model/web/embedding calls. Idempotent.
 *
 * Captures: terminal status, generationsCompleted, candidatesProduced,
 * fitnessHistogram (10 buckets), topCandidates (top 5 by fitness.total),
 * policyVersion (taken from the first fitness score; all should match),
 * runSeed.
 */

const TOP_N_CANDIDATES = 5;
const HISTOGRAM_BUCKETS = 10;

export interface TopCandidateEntry {
  candidateId: string;
  total: number;
  policyVersion: string;
}

export interface ReplaySummary {
  runId: string;
  status: string;
  runSeed?: string;
  policyVersion?: string;
  generationsCompleted: number;
  candidatesProduced: number;
  candidatesInvalid: number;
  candidatesScored: number;
  topCandidates: TopCandidateEntry[];
  fitnessHistogram: { buckets: number[]; min: number; max: number };
}

export interface BuildReplaySummaryInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
}

export interface BuiltReplaySummary {
  summary: ReplaySummary;
  sequenceThrough: number;
}

function buildHistogram(values: number[]): { buckets: number[]; min: number; max: number } {
  if (values.length === 0) return { buckets: new Array(HISTOGRAM_BUCKETS).fill(0), min: 0, max: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const buckets = new Array(HISTOGRAM_BUCKETS).fill(0);
  if (min === max) {
    buckets[0] = values.length;
    return { buckets, min, max };
  }
  const range = max - min;
  for (const v of values) {
    let bucket = Math.floor(((v - min) / range) * HISTOGRAM_BUCKETS);
    if (bucket >= HISTOGRAM_BUCKETS) bucket = HISTOGRAM_BUCKETS - 1;
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  }
  return { buckets, min, max };
}

function summarize(state: CurrentState, runId: string): ReplaySummary {
  const candidatesProduced = Object.keys(state.candidates).length;
  const candidatesInvalid = Object.values(state.candidates).filter(
    (c) => c.status === "invalid",
  ).length;
  const fitnessRows = Object.values(state.fitnessScores);
  const candidatesScored = fitnessRows.length;
  const generationsCompleted = Object.values(state.generations).filter(
    (g) => g.status === "completed",
  ).length;

  const topCandidates: TopCandidateEntry[] = [...fitnessRows]
    .sort((a, b) => b.total - a.total || a.candidateId.localeCompare(b.candidateId))
    .slice(0, TOP_N_CANDIDATES)
    .map((f) => ({
      candidateId: f.candidateId,
      total: f.total,
      policyVersion: f.policyVersion,
    }));

  const policyVersion = fitnessRows[0]?.policyVersion;
  const fitnessHistogram = buildHistogram(fitnessRows.map((f) => f.total));

  return {
    runId,
    status: state.run?.status ?? "unknown",
    ...(state.run?.seed !== undefined ? { runSeed: state.run.seed } : {}),
    ...(policyVersion !== undefined ? { policyVersion } : {}),
    generationsCompleted,
    candidatesProduced,
    candidatesInvalid,
    candidatesScored,
    topCandidates,
    fitnessHistogram,
  };
}

export async function buildReplaySummary(
  input: BuildReplaySummaryInput,
): Promise<BuiltReplaySummary> {
  const { state, sequenceThrough } = await buildCurrentState({
    db: input.db,
    runId: input.runId,
  });
  return {
    summary: summarize(state, input.runId),
    sequenceThrough,
  };
}
