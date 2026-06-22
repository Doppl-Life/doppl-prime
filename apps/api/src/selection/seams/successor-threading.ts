import { Agenome, ReproductionEvent } from '@doppl/contracts';
import type { RunCaps } from '@doppl/contracts';
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
    return children;
  };
}
