import { randomUUID } from "node:crypto";
import type { CullingEvent, FitnessScore } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../event-store/append.js";

/**
 * Weak-lineage culling (P5.7). Computes a per-generation cull threshold
 * from the population's fitness distribution and emits one
 * `lineage.culled` event per culled agenome, carrying the explanation
 * + per-agenome score snapshot so replay reconstructs why.
 *
 * Threshold (decision D6 in the Phase 5 plan): `median - sigma`, but
 * never below 0. With a small population (typical demo: 5-8 candidates)
 * the median + standard deviation are noisy but stable enough for
 * deterministic culling; the goal is to spare bottom outliers, not to
 * implement statistically rigorous quantile estimation.
 *
 * The returned set is the survivors' agenome IDs (those above the
 * threshold). The caller (U10 allocation) ranks survivors via parent-
 * selection (parent-selection.ts).
 */

export interface CullableCandidate {
  candidateId: string;
  agenomeId: string;
  fitness: FitnessScore;
}

export interface CullWeakLineagesInput {
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  candidates: readonly CullableCandidate[];
  runId: string;
  generationId: string;
  correlationIdFor: (agenomeId: string) => string;
}

export interface CullResult {
  survivors: CullableCandidate[];
  culledAgenomeIds: string[];
  threshold: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  let s = 0;
  for (const v of values) s += (v - mean) ** 2;
  return Math.sqrt(s / values.length);
}

export async function cullWeakLineages(input: CullWeakLineagesInput): Promise<CullResult> {
  if (input.candidates.length === 0) {
    return { survivors: [], culledAgenomeIds: [], threshold: 0 };
  }
  const totals = input.candidates.map((c) => c.fitness.total);
  const med = median(totals);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const sigma = stdDev(totals, mean);
  const threshold = Math.max(0, med - sigma);

  // Group by agenome: an agenome's best candidate is its representative.
  const byAgenome = new Map<string, CullableCandidate>();
  for (const c of input.candidates) {
    const existing = byAgenome.get(c.agenomeId);
    if (!existing || c.fitness.total > existing.fitness.total) {
      byAgenome.set(c.agenomeId, c);
    }
  }

  const survivors: CullableCandidate[] = [];
  const culledAgenomeIds: string[] = [];
  for (const [agenomeId, candidate] of byAgenome) {
    if (candidate.fitness.total >= threshold) {
      survivors.push(candidate);
    } else {
      culledAgenomeIds.push(agenomeId);
      const culling: CullingEvent = {
        id: `cull_${randomUUID()}`,
        runId: input.runId,
        generationId: input.generationId,
        targetIds: [agenomeId],
        reason: `below median - sigma (threshold=${threshold.toFixed(4)})`,
        scoreSnapshot: {
          fitness_total: candidate.fitness.total,
          median: med,
          sigma,
          threshold,
        },
      };
      await input.appendEvent({
        runId: input.runId,
        type: "lineage.culled",
        actor: "selection_controller",
        payload: { culling },
        agenomeId,
        candidateId: candidate.candidateId,
        generationId: input.generationId,
        correlationId: input.correlationIdFor(agenomeId),
      });
    }
  }

  // Sort survivors by descending fitness for stable downstream ordering.
  survivors.sort(
    (a, b) => b.fitness.total - a.fitness.total || a.candidateId.localeCompare(b.candidateId),
  );
  return { survivors, culledAgenomeIds, threshold };
}
