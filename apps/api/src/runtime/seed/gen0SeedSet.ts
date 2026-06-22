import type { Agenome } from '@doppl/contracts';
import { clampSpawnBudget } from '../spawn/spawnBudgetClamp';
import type { SeedAgenomeSet } from './seedAgenomes.config';

/**
 * P3.9 — materialize the run's gen-0 `Agenome[]` from the authored seed set (ARCHITECTURE.md §3 gen-0
 * baseline, §4 replay determinism, §5/rule #1 maxPopulation-respect).
 *
 * PURE: each output has empty `parentIds` (gen-0 has no parents), `seeded` status, a deterministic
 * positional id (`${runId}-gen0-${index}` — replay-stable, no sampling), and the authored traits. The
 * count is clamped to `maxPopulation` by REUSING the kernel-024 `clampSpawnBudget` (single-source the
 * rule-#1 logic — a seed set larger than the cap is clamped DOWN; the run never materializes more gen-0
 * agenomes than the cap permits). The boot-validated seedSet is trusted (no re-parse, lesson §31); the
 * output is `Agenome`-shaped by construction. The `agenome.spawned` emission is the loop's (P3.10/P3.12).
 */
export function materializeGen0(
  seedSet: SeedAgenomeSet,
  runId: string,
  generationId: string,
  maxPopulation: number,
): Agenome[] {
  const count = clampSpawnBudget(seedSet.length, maxPopulation).effectiveSpawns;
  const agenomes: Agenome[] = [];
  for (let index = 0; index < count; index += 1) {
    const template = seedSet[index]!; // index < count <= seedSet.length
    agenomes.push({
      id: `${runId}-gen0-${index}`,
      runId,
      generationId,
      parentIds: [],
      systemPrompt: template.systemPrompt,
      personaWeights: template.personaWeights,
      toolPermissions: template.toolPermissions,
      decompositionPolicy: template.decompositionPolicy,
      spawnBudget: template.spawnBudget,
      status: 'seeded',
    });
  }
  return agenomes;
}
