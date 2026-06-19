import type { Agenome, FitnessScore, RunCaps } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { appendEvent } from "../event-store/append.js";
import { replayReader } from "../event-store/replay-reader.js";
import type { ModelGateway } from "../model-gateway/gateway.js";
import type { PersistedCandidate } from "../runtime/generation-loop.js";
import { createSeededRng } from "../runtime/rng.js";
import { energyEfficiencyForAgenome } from "./components/energy-efficiency.js";
import { type CullableCandidate, cullWeakLineages } from "./cull.js";
import { type RankableCandidate, selectParents } from "./parent-selection.js";
import { assembleSuccessorPopulation } from "./successor.js";

/**
 * `makeReproduceHook` (P5.11 bridge) — bridges Phase 5 into Phase 3's
 * `runGeneration.deps.reproduceHook` injection point. The returned
 * closure matches:
 *   `(agenomes, candidates) => Promise<{ nextAgenomes?: Agenome[] }>`
 *
 * For the current generation the closure:
 *   1. Reads the persisted fitness.scored events to build the
 *      cullable + rankable candidate set.
 *   2. Calls cullWeakLineages (U6) to emit lineage.culled events for
 *      below-threshold agenomes.
 *   3. Calls selectParents (U6) to pick the top-K parents.
 *   4. Maps selected parent candidates back to their Agenome objects
 *      via the agenomes argument.
 *   5. Calls assembleSuccessorPopulation (U10) which dispatches into
 *      reproduceWithFallback (U9) and produces the gen N+1 agenome list.
 */

interface FitnessScoredPayload {
  fitness?: FitnessScore;
}

interface NoveltyScoredPayload {
  novelty?: { score: number; candidateId: string };
}

export interface MakeReproduceHookDeps {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  gateway: ModelGateway;
  runId: string;
  runSeed: string;
  runCaps: RunCaps;
  getCurrentGenerationIndex: () => number;
}

export type ReproduceHook = (
  agenomes: Agenome[],
  candidates: PersistedCandidate[],
) => Promise<{ nextAgenomes?: Agenome[] }>;

async function readFitnessForCandidates(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
  candidateIds: ReadonlySet<string>,
): Promise<Map<string, FitnessScore>> {
  const out = new Map<string, FitnessScore>();
  for await (const env of replayReader(db).events(runId)) {
    if (env.type !== "fitness.scored") continue;
    if (!env.candidateId || !candidateIds.has(env.candidateId)) continue;
    const fitness = (env.payload as FitnessScoredPayload).fitness;
    if (!fitness) continue;
    out.set(env.candidateId, fitness);
  }
  return out;
}

async function readNoveltyScoreForCandidates(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
  candidateIds: ReadonlySet<string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for await (const env of replayReader(db).events(runId)) {
    if (env.type !== "novelty.scored") continue;
    if (!env.candidateId || !candidateIds.has(env.candidateId)) continue;
    const novelty = (env.payload as NoveltyScoredPayload).novelty;
    if (!novelty) continue;
    out.set(env.candidateId, novelty.score);
  }
  return out;
}

export function makeReproduceHook(deps: MakeReproduceHookDeps): ReproduceHook {
  const appendBound = (input: Parameters<typeof appendEvent>[1]) => appendEvent(deps.db, input);

  return async (agenomes, candidates) => {
    if (candidates.length === 0) {
      // Zero-survivors path: empty successor, kernel's existing
      // generation-loop branch handles the rest.
      return {};
    }
    const generationIndex = deps.getCurrentGenerationIndex();
    const generationId = `gen_${generationIndex}`;

    // Build the cullable + rankable candidates from persisted state.
    const candidateIds = new Set(candidates.map((c) => c.candidateId));
    const fitnessMap = await readFitnessForCandidates(deps.db, deps.runId, candidateIds);
    const noveltyMap = await readNoveltyScoreForCandidates(deps.db, deps.runId, candidateIds);

    const cullable: CullableCandidate[] = [];
    for (const c of candidates) {
      const fit = fitnessMap.get(c.candidateId);
      if (!fit) continue; // Not scored — skip (defensive; the scoreHook
      // should have scored everything)
      cullable.push({
        candidateId: c.candidateId,
        agenomeId: c.agenomeId,
        fitness: fit,
      });
    }
    if (cullable.length === 0) return {};

    // Cull weak lineages.
    const cullResult = await cullWeakLineages({
      appendEvent: appendBound,
      candidates: cullable,
      runId: deps.runId,
      generationId,
      correlationIdFor: (agenomeId) => `cull_${agenomeId}`,
    });

    // Rank survivors using fitness × normalizedNovelty × energyEfficiency.
    const rankable: RankableCandidate[] = [];
    for (const survivor of cullResult.survivors) {
      const novelty = noveltyMap.get(survivor.candidateId) ?? 0;
      const energy = await energyEfficiencyForAgenome({
        db: deps.db,
        runId: deps.runId,
        agenomeId: survivor.agenomeId,
      });
      rankable.push({
        ...survivor,
        noveltyScore: novelty,
        energyEfficiency: energy,
      });
    }

    const k = Math.max(2, Math.floor(deps.runCaps.maxPopulation / 2));
    const rng = createSeededRng(`${deps.runSeed}:parents:gen=${generationIndex}`);
    const selectedRankable = selectParents({
      candidates: rankable,
      k,
      rng,
    });

    // Map selected candidates back to their Agenome objects.
    const agenomesById = new Map(agenomes.map((a) => [a.id, a]));
    const parents: Agenome[] = [];
    for (const sel of selectedRankable) {
      const ag = agenomesById.get(sel.agenomeId);
      if (ag) parents.push(ag);
    }

    if (parents.length === 0) return {};

    const nextAgenomes = await assembleSuccessorPopulation({
      gateway: deps.gateway,
      appendEvent: appendBound,
      parents,
      caps: deps.runCaps,
      runId: deps.runId,
      runSeed: deps.runSeed,
      generationIndex,
      correlationIdFor: (i) => `reproduce_gen${generationIndex + 1}_${i}`,
    });
    return { nextAgenomes };
  };
}
