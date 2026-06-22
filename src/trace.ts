// Builds a complete machine trace for one kernel run.
import type {
  CandidatePool,
  Dial,
  GenerationQuality,
  GenerationSummary,
  LensConfig,
  RunCaps,
  RunTrace,
  ScoredCandidate,
  ScoredCandidatePool,
  SeedFixture,
  TraceEvent,
} from './contracts/index.ts';
import { RUN_TRACE_SCHEMA_VERSION, boundaryContracts, defaultRunCaps, getBoundary } from './contracts/index.ts';
import { scoreCandidatePool } from './fitness.ts';
import { generateCandidatePool } from './generate.ts';
import { applyLenses } from './lens.ts';
import { compareSelections } from './select.ts';

function runId(dial: Dial): string {
  return `kernel-${dial}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

function mergeCaps(caps?: Partial<RunCaps>): RunCaps {
  return {
    ...defaultRunCaps,
    ...caps,
  };
}

function mergePools(seed: SeedFixture['seed'], pools: CandidatePool[]): CandidatePool {
  return {
    seed,
    candidates: pools.flatMap((pool) => pool.candidates),
    lineage: {
      seedId: seed.id,
      generated: pools.flatMap((pool) => pool.lineage.generated),
      rejected: pools.flatMap((pool) => pool.lineage.rejected),
    },
  };
}

function mergeScoredPools(seed: SeedFixture['seed'], pools: ScoredCandidatePool[]): ScoredCandidatePool {
  return {
    seed,
    candidates: pools.flatMap((pool) => pool.candidates),
  };
}

function total(candidate: ScoredCandidate): number {
  return candidate.fitness.novelty + candidate.fitness.grounding;
}

function tokenSet(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((token) => token.length > 2));
}

function overlap(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const item of left) {
    if (right.has(item)) shared += 1;
  }
  return shared / Math.min(left.size, right.size);
}

function generationQuality(children: ScoredCandidate[], parents: ScoredCandidate[]): { quality: GenerationQuality; detail: string } {
  if (!children.length) return { quality: 'not_run', detail: 'No selected parent produced a generation-2 child under caps.' };
  const parentsById = new Map(parents.map((parent) => [parent.id, parent]));
  const assessments = children.map((child) => {
    const parent = parentsById.get(child.parentId);
    if (!parent) return 'drifted';
    if (overlap(`${child.title} ${child.thesis}`, `${parent.title} ${parent.thesis}`) > 0.72) return 'duplicated';
    if (total(child) > total(parent) + 0.03) return 'improved';
    return 'drifted';
  });

  if (assessments.includes('improved')) {
    return { quality: 'improved', detail: `${assessments.filter((item) => item === 'improved').length}/${children.length} generation-2 child candidate(s) improved on parent combined novelty+grounding.` };
  }
  if (assessments.every((item) => item === 'duplicated')) {
    return { quality: 'duplicated', detail: 'Generation-2 children mostly repeated parent thesis language.' };
  }
  return { quality: 'drifted', detail: 'Generation-2 children changed direction without improving combined novelty+grounding.' };
}

function generationSummary(
  index: number,
  parents: ScoredCandidate[],
  generated: CandidatePool,
  selectedIds: string[],
  quality: GenerationQuality,
  detail: string,
): GenerationSummary {
  return {
    index,
    parentCandidateIds: parents.map((candidate) => candidate.id),
    generatedCandidateIds: generated.candidates.map((candidate) => candidate.id),
    selectedCandidateIds: selectedIds,
    rejectedNodeIds: generated.lineage.rejected.map((node) => node.id),
    quality,
    detail,
  };
}

export function buildRunTrace(fixture: SeedFixture, dial: Dial, options: { caps?: Partial<RunCaps>; lenses?: LensConfig[] } = {}): RunTrace {
  const caps = mergeCaps(options.caps);
  const events: TraceEvent[] = [];
  const generationSummaries: GenerationSummary[] = [];

  const generated1 = generateCandidatePool(fixture, { generation: 1, caps });
  events.push(generated1.event);

  const scored1 = scoreCandidatePool(generated1.pool, { asOf: fixture.asOf });
  events.push(scored1.event);

  const parentSelection = compareSelections(scored1.scoredPool, dial);
  const parents = parentSelection.comparison.focus.selected;
  generationSummaries.push(generationSummary(1, [], generated1.pool, parents.map((candidate) => candidate.id), 'not_run', `Generation 1 selected [${parents.map((candidate) => candidate.id).join(', ')}] as parents for fixture child expansion.`));

  const pools = [generated1.pool];
  const scoredPools = [scored1.scoredPool];

  if (caps.maxGenerations >= 2 && parents.length > 0) {
    const generated2 = generateCandidatePool(fixture, {
      generation: 2,
      parentCandidateIds: parents.map((candidate) => candidate.id),
      caps,
      existingCandidateCount: generated1.pool.candidates.length,
    });
    events.push(generated2.event);
    pools.push(generated2.pool);

    if (generated2.pool.candidates.length > 0) {
      const scored2 = scoreCandidatePool(generated2.pool, { asOf: fixture.asOf });
      events.push(scored2.event);
      scoredPools.push(scored2.scoredPool);
      const quality = generationQuality(scored2.scoredPool.candidates, parents);
      generationSummaries.push(generationSummary(2, parents, generated2.pool, scored2.scoredPool.candidates.map((candidate) => candidate.id), quality.quality, quality.detail));
    } else {
      generationSummaries.push(generationSummary(2, parents, generated2.pool, [], 'not_run', 'No generation-2 candidates available for selected parents.'));
    }
  }

  const combinedPool = mergePools(fixture.seed, pools);
  const combinedScored = mergeScoredPools(fixture.seed, scoredPools);
  const selected = compareSelections(combinedScored, dial);
  events.push(selected.event);

  const selectedIds = new Set(selected.comparison.focus.selected.map((candidate) => candidate.id));
  const finalGenerationSummaries = generationSummaries.map((summary) => ({
    ...summary,
    selectedCandidateIds: summary.generatedCandidateIds.filter((id) => selectedIds.has(id)),
  }));

  const lensed = applyLenses(combinedScored, selected.comparison, options.lenses || []);
  events.push(lensed.event);

  const traceEvent: TraceEvent = {
    stage: 'trace',
    input: 'SelectionComparison + LensResult[] + boundary contracts + goal checks',
    decision: 'Emit the machine trace for tools and replay.',
    reason: 'The kernel emits process facts; microscope tools translate those facts for humans.',
    output: 'RunTrace',
    goalChecks: [
      {
        id: 'machine-trace-emitted',
        label: 'The kernel emits a machine trace without requiring a human projection in the engine contract.',
        passed: true,
        detail: 'RunTrace contains lineage, generation summaries, lens results, goal checks, and selection comparison.',
      },
      {
        id: 'bounded-recursion',
        label: 'Recursion is bounded by explicit caps.',
        passed: combinedPool.candidates.length <= caps.maxPopulation &&
          finalGenerationSummaries.length <= caps.maxGenerations &&
          finalGenerationSummaries.every((summary) => summary.index <= caps.maxGenerations),
        detail: `generations=${finalGenerationSummaries.length}; candidates=${combinedPool.candidates.length}; caps=${JSON.stringify(caps)}`,
      },
    ],
    boundary: getBoundary('trace'),
  };
  events.push(traceEvent);

  const goalChecks = events.flatMap((event) => event.goalChecks);

  return {
    schemaVersion: RUN_TRACE_SCHEMA_VERSION,
    runId: runId(dial),
    dial,
    seed: fixture.seed,
    caps,
    candidateCount: combinedPool.candidates.length,
    lineage: combinedPool.lineage,
    generations: finalGenerationSummaries,
    boundaryContracts,
    events,
    goalChecks,
    comparison: selected.comparison,
    lensResults: lensed.lensResults,
    terminalReason: 'completed under finite caps',
  };
}
