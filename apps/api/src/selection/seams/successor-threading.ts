import { Agenome, CandidateIdea, FitnessScore, ReproductionEvent } from '@doppl/contracts';
import type { RunCaps } from '@doppl/contracts';
import type { RunEventRow } from '../../event-store';
import { clampSpawnBudget, type NextPopulationArgs } from '../../runtime';
import { applyReproduction } from '../reproduction/reproduce';
import type { FusionParent } from '../reproduction/parent-distance';

/**
 * createSuccessorThreading (P5.11, ARCHITECTURE.md §8) — selection's real impl of the kernel's W3a
 * `nextPopulation` hook. It turns a completed generation's reproduced offspring into the NEXT generation's
 * population: read the completed generation's `agenome.reproduced`/`agenome.fused` events from the log,
 * reconstruct each child via `applyReproduction(pool, reproductionEvent)` (rule #7 — no gateway/rng,
 * byte-faithful to what reproduction produced), re-home it to the next generation (status `seeded`), and
 * return them. This is what makes gen N+1 evolve from gen N's offspring.
 *
 * The kernel (W3a) owns the SIZE cap — this impl returns ALL reconstructed children and the loop clamps to
 * `maxPopulation`. The per-child rule-#1 fields are this impl's (W3a forward-flag): `parentIds.length ≤ 2`
 * (reproduction guarantees it — assert), `spawnBudget = min(hint, remaining caps)` via the kernel's
 * single-source `clampSpawnBudget`. Selection proposes the population; the kernel bounds it.
 */
export interface SuccessorThreadingDeps {
  readonly caps: RunCaps;
  /**
   * ELITISM (anti-regression) — how many top-fitness scored survivors to carry UNCHANGED into the next
   * generation, in addition to the reproduced offspring. Without elitism (the default 0) gen N+1 is
   * offspring-ONLY, so each generation's BEST genome is lost to regressive reproduction (fusion blends
   * toward the mean, mutation drifts) — the loop finds a good idea and throws it away (the 0.70→0.57
   * best-fitness drop). Carrying the top-K survivor agenomes forward UNCHANGED (the SAME individuals
   * survive) lets proven-best genomes persist + keep breeding, so selection compounds and the trajectory
   * holds its peaks. Pure ranking over the persisted log (rule #7 — replay-stable). Default 0 keeps the
   * seam additive: absent → byte-identical to the pre-elitism offspring-only threading.
   */
  readonly eliteCount?: number;
}

/** The loop's per-generation id scheme is `${runId}-gen${g}` (generationLoop.ts) — derive gen N+1 from it. */
const GENERATION_ID_PATTERN = /^(.*-gen)(\d+)$/;

function deriveNextGenerationId(completedGenerationId: string): string {
  const match = GENERATION_ID_PATTERN.exec(completedGenerationId);
  if (match === null) {
    // Fail LOUD: the derivation couples to the loop's id convention — a non-matching id is a contract
    // violation, never silently mis-homed to a garbage generationId (which would corrupt lineage).
    throw new Error(
      `successor-threading: cannot derive the next generationId from "${completedGenerationId}" ` +
        `(expected the loop's "<runId>-gen<N>" scheme)`,
    );
  }
  return `${match[1]}${Number(match[2]) + 1}`;
}

/**
 * rehome — re-home a reconstructed child to the next generation: `status: 'seeded'` (so the
 * candidate-production loop's seeded→active works), `generationId = nextGenerationId`, preserving the
 * reconstructed traits. Rule-#1 per-child: `parentIds.length ≤ 2` (assert — reproduction guarantees it);
 * `spawnBudget` clamped to maxPopulation via the kernel single-source `clampSpawnBudget`. maxSpawnDepth is
 * not active in the generation loop (no sub-agent spawning); the SIZE cap stays W3a's kernel clamp.
 */
function rehome(child: Agenome, nextGenerationId: string, caps: RunCaps): Agenome {
  if (child.parentIds.length > 2) {
    throw new Error(
      `successor-threading: reconstructed child ${child.id} has ${child.parentIds.length} parents (>2) — reproduction invariant violated`,
    );
  }
  return Agenome.parse({
    ...child,
    generationId: nextGenerationId,
    status: 'seeded',
    spawnBudget: clampSpawnBudget(child.spawnBudget, caps.maxPopulation).effectiveSpawns,
  });
}

/**
 * Rank the eligible parents by their BEST candidate fitness in the just-completed generation (descending;
 * tie-break agenome id ascending — deterministic). PURE over the persisted log, keyed back to its producing
 * agenome via `candidate.created` (rule #7 — read the recorded outcome, never recompute; replay reconstructs
 * the identical order). Scoped to `completedGenerationId` so elitism keeps THIS generation's best — a genome
 * that stopped performing isn't retained on a stale historical peak. A parent with no scored candidate this
 * generation is dropped (no fitness basis — never an elite).
 *
 * JUDGE-KEYED (Phase A / #6) — the rank key is the persisted `components.judge_acceptance` (the un-hackable
 * held-out-judge signal, rule #6), NOT the blended `total` (~31% agent-visible critic/novelty). So elitism
 * preserves the genome the JUDGE rewards, never a high-`total` decoy that gamed the agent-visible components —
 * the breeding-pool analog of the honest gate (convergence.ts). Falls back to `total` for any candidate whose
 * fitness carries no judge component (the judge-degrade path); both live on [0,1] so the key stays scale-safe.
 * The SURFACED/terminal winner is unaffected — it is selected separately by `total` (the official fitness).
 * Exported for unit pinning.
 */
export function rankEligibleByFitness(
  eligibleParents: readonly Agenome[],
  completedGenerationId: string,
  log: readonly RunEventRow[],
): Agenome[] {
  const candidateAgenome = new Map<string, string>(); // candidateId → agenomeId (this generation)
  const bestByCandidate = new Map<string, number>(); // candidateId → best judge-keyed rank score
  for (const row of log) {
    if (row.generationId !== completedGenerationId) continue;
    if (row.type === 'candidate.created') {
      const parsed = CandidateIdea.safeParse(row.payload);
      if (parsed.success) candidateAgenome.set(parsed.data.id, parsed.data.agenomeId);
    } else if (row.type === 'fitness.scored' && row.candidateId !== null) {
      const parsed = FitnessScore.safeParse(row.payload);
      if (!parsed.success) continue;
      // #6 — rank by the judge component (honest), fall back to total when the judge degraded (absent).
      const rankScore = parsed.data.components.judge_acceptance ?? parsed.data.total;
      const prev = bestByCandidate.get(row.candidateId);
      if (prev === undefined || rankScore > prev) {
        bestByCandidate.set(row.candidateId, rankScore);
      }
    }
  }
  const fitnessByAgenome = new Map<string, number>(); // agenomeId → its best candidate's total
  for (const [candidateId, agenomeId] of candidateAgenome) {
    const fit = bestByCandidate.get(candidateId);
    if (fit === undefined) continue;
    const prev = fitnessByAgenome.get(agenomeId);
    if (prev === undefined || fit > prev) fitnessByAgenome.set(agenomeId, fit);
  }
  return eligibleParents
    .filter((agenome) => fitnessByAgenome.has(agenome.id))
    .sort((a, b) => {
      const fa = fitnessByAgenome.get(a.id) ?? 0;
      const fb = fitnessByAgenome.get(b.id) ?? 0;
      return fb !== fa ? fb - fa : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export function createSuccessorThreading(
  deps: SuccessorThreadingDeps,
): (args: NextPopulationArgs) => Promise<readonly Agenome[]> {
  return async (args: NextPopulationArgs): Promise<readonly Agenome[]> => {
    const { completedGenerationId, eligibleParents, log } = args;
    const nextGenerationId = deriveNextGenerationId(completedGenerationId);

    // applyReproduction resolves the parents named in each ReproductionEvent by id from the pool +
    // reconstructs from the persisted crossoverPoints/mutationSummary — it never reads `noveltyVector`
    // (that's LIVE-only via selectDistantPair), so the pool needs only the agenome.
    const pool: FusionParent[] = eligibleParents.map((agenome) => ({ agenome }));

    const children: Agenome[] = [];
    for (const row of log) {
      if (row.generationId !== completedGenerationId) continue;
      if (row.type !== 'agenome.fused' && row.type !== 'agenome.reproduced') continue;
      const parsed = ReproductionEvent.safeParse(row.payload);
      if (!parsed.success) continue; // a corrupt row never fabricates a child.
      // rule #7 — reconstruct the child from the persisted event with NO gateway/rng (structural).
      const child = applyReproduction(pool, parsed.data);
      children.push(rehome(child, nextGenerationId, deps.caps));
    }

    // ELITISM — carry the top-K scored survivors UNCHANGED into gen N+1, PREPENDED so the kernel's
    // maxPopulation clamp (generationLoop.ts — `population.slice(0, maxPopulation)`) drops trailing
    // offspring, never an elite (rule #1: selection proposes, the kernel bounds). Each elite is the SAME
    // individual re-homed via the same `rehome` as an offspring (status seeded, spawnBudget clamped) — its
    // genome rides through BYTE-IDENTICAL (re-home touches only generationId/status/spawnBudget, never
    // personaWeights/systemPrompt/toolPermissions). The elite keeps its ORIGINAL id, so it is already a
    // node in current-state (no fabricated lineage). Default 0 → offspring-only (byte-identical to HEAD).
    const eliteCount = deps.eliteCount ?? 0;
    if (eliteCount <= 0) return children;
    const elites = rankEligibleByFitness(eligibleParents, completedGenerationId, log)
      .slice(0, eliteCount)
      .map((parent) => rehome(parent, nextGenerationId, deps.caps));
    return [...elites, ...children];
  };
}
