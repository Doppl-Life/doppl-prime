import { CandidateIdea, FitnessScore, NoveltyScore } from '@doppl/contracts';
import type { Agenome } from '@doppl/contracts';
import type { RunEventRow } from '../../event-store';
import type { ModelGateway } from '../../model-gateway';
import type { ReproduceContext, ReproduceSeam } from '../../runtime';
import type { MutationBounds } from '../reproduction/mutate';
import { assembleSuccessor, type SuccessorParent } from '../successor';

/**
 * createReproduceSeam (P5.10/P5.11, ARCHITECTURE.md §8) — selection's real impl of the kernel's injected
 * `ReproduceSeam` port (`generationLoop.ts:466`). Given the loop's eligible `parents` + the generation's
 * `scoredEvents`, it projects each parent's best-candidate heuristic weights from the persisted log, then
 * runs `assembleSuccessor` (heuristic allocation, caps-clamped — rule #1) which reproduces per slot via
 * `reproduce`: ≥2 distinct → two-level fusion through the gateway (`agenome.fused`); 1 → `mutation_only`
 * (`agenome.reproduced`); 0 → abort (`reproduction_aborted_insufficient_parents`). Every event is appended
 * through the injected `ctx.append` (rule #2/#4); the seam emits NO `energy.spent` (reproduction energy is
 * the kernel's debit, rule #8).
 *
 * Replay-faithfulness is selection's own (rule #7): each child reconstructs from its frozen
 * `ReproductionEvent` (`crossoverPoints`/`mutationSummary`) via `applyReproduction` with no gateway/rng
 * (LESSONS §47). So the kernel's generic `ctx.outcomes` is UNUSED — selection's RNG outcomes live in the
 * `ReproductionEvent`, not the loop's outcome log (which the loop never persists post-reproduce); the
 * per-run RNG `seed` is injected via `ReproduceSeamDeps.seed` (from `RunConfig.rngSeed` at the boot root).
 *
 * Returns `void` — the successor population is persisted as events; THREADING the offspring into gen N+1's
 * population is the W3 boot-root slice (`selection-013`), not this slice.
 */
export interface ReproduceSeamDeps {
  readonly gateway: ModelGateway;
  /** The rule-#1 clamp bound — gen N+1 starts empty, so `remainingPopulation = maxPopulation`. */
  readonly maxPopulation: number;
  readonly bounds: MutationBounds;
  /** The per-run RNG seed (RunConfig.rngSeed); each slot derives a distinct seed, replay reads outcomes. */
  readonly seed: number;
  /** Injected id factory — keeps the seam free of `Math.random`/uuid (byte-deterministic, §24). */
  readonly newId: () => string;
  /** EXPERIMENT — the r/K mutation share (0 = fusion_only control). Default 0 → byte-identical to HEAD. */
  readonly mutationFraction?: number;
}

interface BestCandidate {
  candidateId: string;
  total: number;
  novelty: number;
  energyEfficiency: number;
  sequence: number;
}

/**
 * projectSuccessorParents — projects each eligible parent's heuristic weights from the persisted
 * `scoredEvents` (rule #7 — read back, never recompute). For each parent agenome: its BEST candidate
 * (highest `fitness.scored.total`, tie-break LOWEST sequence — deterministic, mirrors LESSONS §68)
 * supplies the fitness, energy-efficiency (`fitness.scored.components.energy_efficiency`), novelty
 * (`fitness.scored.components.novelty`) + novelty vector (`NoveltyScore.vector` from `novelty.scored`).
 *
 * The novelty VALUE is read from the persisted FITNESS COMPONENT (`components.novelty`), not from
 * `novelty.scored`: the scorer populates `components.novelty` on BOTH the happy path AND the degrade path
 * (the lexical estimate — score-fitness.ts `noveltyEntry`), whereas `novelty.scored` is emitted ONLY on
 * the happy path. Sourcing it from `novelty.scored` made a degraded-novelty parent (embedding failed →
 * `novelty_scoring_degraded`, no `novelty.scored`) project `novelty: 0`, which zeroed its allocation
 * weight (fitness × 0 × energyEff) and — when ALL parents degraded — collapsed the whole pool to
 * `totalWeight 0` → 0 spawns → a SILENT extinction after gen 0 (the live demo-blocker). Reading novelty
 * from the same component the scorer used keeps reproduction alive whenever fitness scored at all. The
 * embedding VECTOR stays `novelty.scored`-only (it has no lexical fallback): a degraded best candidate
 * yields `noveltyVector: undefined` → `parentDistance` treats it as max-distant (never NaN/throw). A
 * parent with no scored candidate is skipped (no heuristic basis).
 */
export function projectSuccessorParents(
  parents: readonly Agenome[],
  scoredEvents: readonly RunEventRow[],
): SuccessorParent[] {
  // candidateId → agenomeId (from candidate.created — fitness.scored carries only candidateId).
  const candidateAgenome = new Map<string, string>();
  // candidateId → best-by-lowest-sequence fitness {total, novelty, energyEfficiency, sequence}.
  const fitnessByCandidate = new Map<string, BestCandidate>();
  // candidateId → embedding vector (from novelty.scored — happy-path only; absent on degrade).
  const vectorByCandidate = new Map<string, readonly number[]>();

  for (const row of scoredEvents) {
    if (row.type === 'candidate.created') {
      const parsed = CandidateIdea.safeParse(row.payload);
      if (parsed.success) candidateAgenome.set(parsed.data.id, parsed.data.agenomeId);
    } else if (row.type === 'fitness.scored' && row.candidateId !== null) {
      const parsed = FitnessScore.safeParse(row.payload);
      if (!parsed.success) continue;
      const existing = fitnessByCandidate.get(row.candidateId);
      if (existing === undefined || row.sequence < existing.sequence) {
        fitnessByCandidate.set(row.candidateId, {
          candidateId: row.candidateId,
          total: parsed.data.total,
          // novelty VALUE from the fitness component — populated on BOTH the happy + degrade paths (see
          // the function doc): the allocation weight survives a degraded-novelty generation.
          novelty: parsed.data.components.novelty ?? 0,
          energyEfficiency: parsed.data.components.energy_efficiency ?? 0,
          sequence: row.sequence,
        });
      }
    } else if (row.type === 'novelty.scored' && row.candidateId !== null) {
      const parsed = NoveltyScore.safeParse(row.payload);
      // Capture ONLY the embedding vector (the value rides the fitness component above) — the vector has
      // no lexical fallback, so a degraded candidate has none → parentDistance treats it as max-distant.
      if (parsed.success) vectorByCandidate.set(row.candidateId, parsed.data.vector);
    }
  }

  const result: SuccessorParent[] = [];
  for (const parent of parents) {
    let best: BestCandidate | undefined;
    for (const [candidateId, agenomeId] of candidateAgenome) {
      if (agenomeId !== parent.id) continue;
      const fit = fitnessByCandidate.get(candidateId);
      if (fit === undefined) continue;
      if (
        best === undefined ||
        fit.total > best.total ||
        (fit.total === best.total && fit.sequence < best.sequence)
      ) {
        best = fit;
      }
    }
    if (best === undefined) continue; // no scored candidate → no heuristic basis (skip).
    const vector = vectorByCandidate.get(best.candidateId);
    // Omit noveltyVector when novelty degraded (exactOptionalPropertyTypes — never assign `undefined`);
    // `parentDistance` treats a missing vector as max-distant.
    const vectorPart = vector === undefined ? {} : { noveltyVector: vector };
    result.push({
      agenome: parent,
      ...vectorPart,
      fitness: best.total,
      // novelty VALUE from the fitness component (survives a degraded-novelty generation — see the doc).
      novelty: best.novelty,
      energyEfficiency: best.energyEfficiency,
    });
  }
  return result;
}

export function createReproduceSeam(deps: ReproduceSeamDeps): ReproduceSeam {
  return async (ctx: ReproduceContext): Promise<void> => {
    const { runId, generationId, append, parents, scoredEvents } = ctx;
    const eligibleParents = projectSuccessorParents(parents, scoredEvents);
    // BUG 1 (run 6b714273) — the offspring headroom is the KERNEL-COMPUTED `ctx.spawnBudget` (rule #1: a
    // HINT clamped to `min(maxPopulation, remaining-energy headroom)`, computed by the loop over the
    // persisted log — NEVER the seam's own raw `maxPopulation`, which ignored remaining caps and minted a
    // fresh full-cap batch every generation). The kernel additionally backstops over-production post-reproduce.
    // `deps.maxPopulation` is the belt-and-suspenders ceiling (the budget never exceeds it; the loop clamps).
    const remainingPopulation = Math.min(ctx.spawnBudget, deps.maxPopulation);
    // assembleSuccessor runs allocate (caps-clamped, rule #1) → reproduce per slot (fusion/mutation_only/
    // abort), appending the offspring events through `append`. The returned population is discarded — the
    // successor is persisted as events; gen N+1 threading is the W3 boot root. `ctx.outcomes` is unused.
    await assembleSuccessor(
      {
        runId,
        generationId,
        eligibleParents,
        remainingPopulation,
        seed: deps.seed,
        ...(deps.mutationFraction !== undefined ? { mutationFraction: deps.mutationFraction } : {}),
      },
      { gateway: deps.gateway, emit: append, newId: deps.newId, bounds: deps.bounds },
    );
  };
}
