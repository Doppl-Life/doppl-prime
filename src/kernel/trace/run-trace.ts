// RunTrace — the canonical machine specimen for one growth-stage arrow.
//
// The kernel's native run aggregate is `KernelRun` (boundary.ts). The canonical
// trace shape is `contracts/run-trace.md`. This module is the projection from the
// aggregate to the specimen: `buildRunTraces(run) -> RunTrace[]`, one trace per
// evolved growth-stage node the run compiled.
//
// Lossy seams (dalton's aggregate is leaner than the contract); each is deliberate:
// - One trace per evolved `doppl`. `problem_recovery` is created, not evolved (no
//   generations), so it is a parent input, never its own trace.
// - `Tide` is binary; the kernel dial has a `balanced` setting. Tide is derived:
//   noveltyWeight > groundingWeight -> 'diverge', else 'converge'.
// - `Candidate` is richer than dalton's `CandidateSolution`; fields are mapped, not
//   invented (see `toCandidate`).
// - The judge result is held as data (axes + rating); rendered `### Evaluation`
//   markdown stays in the node compiler.

import type {
  CandidateSolution,
  EvolutionGeneration,
  FitnessRecord,
  KernelRun,
  KnowledgePacketItem,
  Mutagen,
  RunEvent,
} from '../boundary.ts';
import { compileProposalNodes } from '../compile/node-compiler.ts';

type SlugId = string;
type Uuid = string;
type Iso8601 = string;
type NonEmptyArray<T> = [T, ...T[]];

type Stage = 'case_study' | 'problem_recovery' | 'doppl';
type GrowthStage = 'problem_recovery' | 'doppl';
type KernelName = 'prime';

type Tide = 'diverge' | 'converge';
type MeasurementAxis = 'novelty' | 'grounding';
type Measurement = number;

export type RunIdentity = {
  run_id: Uuid;
  stage: GrowthStage;
  kernel: KernelName;
  started_at: Iso8601;
  completed_at: Iso8601;
};

export type TraceSynopsis = { stage: Stage; node_id: SlugId; synopsis: string };
export type RunDiscoveryInput = {
  field_id: SlugId;
  entries: { discovery_id?: SlugId; found: string; field: string }[];
};
export type RunInputs = {
  parent_nodes: SlugId[];
  trace_synopses: TraceSynopsis[];
  discovery: RunDiscoveryInput;
};

type ReproductionUnit = 'problem-frame' | 'solution-candidate' | 'thesis' | 'consequence' | 'agenome';
type CandidateStatus = 'generated' | 'rejected_no_delta' | 'measured';

export type Candidate = {
  candidate_id: Uuid;
  parent_candidate_id?: Uuid;
  generation: number;
  unit: ReproductionUnit;
  mutagen?: Mutagen;
  mutagen_lineage: Mutagen[];
  headline: string;
  synopsis: string;
  claim: string;
  growth: string;
  delta: string;
  status: CandidateStatus;
};

type AxisMeasurement<A extends MeasurementAxis> = { axis: A; value: Measurement; reason: string };
export type CandidateMeasurements = {
  candidate_id: Uuid;
  measurements: [AxisMeasurement<'novelty'>, AxisMeasurement<'grounding'>];
  decay: 0;
  decay_factor: 1;
};

export type SelectionSchedule = {
  keep: 3;
  priority_axis: MeasurementAxis;
  floor_axis: MeasurementAxis;
  floor: Measurement;
};
export type SelectionDecision = {
  candidate_id: Uuid;
  pareto_front: number;
  directional_score: Measurement;
  selected: boolean;
  reason: string;
};
export type RegretSibling =
  | { status: 'stable'; candidate_id: Uuid }
  | { status: 'replaced'; candidate_id: Uuid; replacement_candidate_id: Uuid; other_tide: Tide }
  | { status: 'dropped'; candidate_id: Uuid; other_tide: Tide };
export type SelectionStep = {
  schedule: SelectionSchedule;
  tide: Tide;
  decisions: SelectionDecision[];
  retained_candidate_ids: NonEmptyArray<Uuid>;
  compiled_candidate_id: Uuid;
  regret_siblings: RegretSibling[];
};

export type LensResult = {
  context: { actor: string; constraints?: string[] };
  score: Measurement;
  threshold: 0.55;
  passed: boolean;
  reason: string;
};

type JudgeAxisName = 'Novelty' | 'Grounding' | 'Falsifiability' | 'Cost-efficiency' | 'Relevance';
type AxisEvaluation = { axis: JudgeAxisName; score: number; reasoning: string };
export type TraceJudgeStep = {
  candidate_id: Uuid;
  result: { judge: number; temporal: boolean; axes: AxisEvaluation[] };
};

export type CompileStep = { output: { node_id: SlugId; path?: string } };

export type GenerationStep = {
  generation: number;
  generate: { candidates: Candidate[] };
  fitness: { measured: CandidateMeasurements[] };
  selection: SelectionStep;
};

export type RunTrace = {
  identity: RunIdentity;
  inputs: RunInputs;
  generations: NonEmptyArray<GenerationStep>;
  lens: LensResult;
  judge: TraceJudgeStep;
  compile: CompileStep;
};

function eventTime(events: RunEvent[], type: RunEvent['type']): Iso8601 | undefined {
  return events.find((event) => event.type === type)?.occurredAt;
}

function axesOf(record: FitnessRecord | undefined): { novelty: number; grounding: number } {
  return record?.selection?.axes ?? { novelty: 0, grounding: 0 };
}

function weightsOf(record: FitnessRecord | undefined): { novelty: number; grounding: number } {
  return record?.selection?.weights ?? { novelty: 0.5, grounding: 0.5 };
}

function directionalScore(
  axes: { novelty: number; grounding: number },
  weights: { novelty: number; grounding: number },
): number {
  return Number((axes.novelty * weights.novelty + axes.grounding * weights.grounding).toFixed(3));
}

function toCandidate(
  candidate: CandidateSolution,
  measured: boolean,
  parentId: Uuid | undefined,
): Candidate {
  return {
    candidate_id: candidate.id,
    ...(parentId === undefined ? {} : { parent_candidate_id: parentId }),
    generation: candidate.generation,
    unit: 'solution-candidate',
    ...(candidate.mutagen === undefined ? {} : { mutagen: candidate.mutagen }),
    mutagen_lineage: candidate.mutagenLineage ?? [],
    headline: candidate.title,
    synopsis: candidate.summary,
    claim: candidate.mechanism,
    growth: candidate.summary,
    delta: candidate.claimedDelta,
    status: measured ? 'measured' : 'generated',
  };
}

function toMeasurements(record: FitnessRecord): CandidateMeasurements {
  const axes = axesOf(record);
  return {
    candidate_id: record.candidateId,
    measurements: [
      { axis: 'novelty', value: axes.novelty, reason: record.rationale },
      { axis: 'grounding', value: axes.grounding, reason: record.rationale },
    ],
    decay: 0,
    decay_factor: 1,
  };
}

function regretFor(
  retainedIds: string[],
  records: FitnessRecord[],
): RegretSibling[] {
  if (records.length < 2) return retainedIds.map((id) => ({ status: 'stable', candidate_id: id }));
  const weights = weightsOf(records[0]);
  const otherWeights = { novelty: weights.grounding, grounding: weights.novelty };
  const otherTide: Tide = otherWeights.novelty > otherWeights.grounding ? 'diverge' : 'converge';
  const oppositeRanked = [...records]
    .sort((a, b) => directionalScore(axesOf(b), otherWeights) - directionalScore(axesOf(a), otherWeights))
    .map((record) => record.candidateId);
  const oppositeKept = new Set(oppositeRanked.slice(0, retainedIds.length));
  const promoted = oppositeRanked.filter((id) => !retainedIds.includes(id));
  return retainedIds.map((id, index): RegretSibling => {
    if (oppositeKept.has(id)) return { status: 'stable', candidate_id: id };
    const replacement = promoted[index];
    if (replacement === undefined) return { status: 'dropped', candidate_id: id, other_tide: otherTide };
    return { status: 'replaced', candidate_id: id, replacement_candidate_id: replacement, other_tide: otherTide };
  });
}

function buildSelection(
  generation: EvolutionGeneration,
  records: FitnessRecord[],
  compiledId: Uuid,
): SelectionStep {
  const weights = weightsOf(records[0]);
  const priority_axis: MeasurementAxis = weights.novelty >= weights.grounding ? 'novelty' : 'grounding';
  const floor_axis: MeasurementAxis = priority_axis === 'novelty' ? 'grounding' : 'novelty';
  const tide: Tide = weights.novelty > weights.grounding ? 'diverge' : 'converge';
  const [parentA, parentB] = generation.selectedParentIds;
  const retained: NonEmptyArray<Uuid> = parentA && parentB ? [parentA, parentB] : [compiledId];
  const decisions: SelectionDecision[] = records.map((record) => ({
    candidate_id: record.candidateId,
    pareto_front: record.selection?.frontier.rank ?? 1,
    directional_score: directionalScore(axesOf(record), weights),
    selected: retained.includes(record.candidateId),
    reason: record.rationale,
  }));
  return {
    schedule: { keep: 3, priority_axis, floor_axis, floor: 0 },
    tide,
    decisions,
    retained_candidate_ids: retained,
    compiled_candidate_id: generation.childId ?? compiledId,
    regret_siblings: regretFor(retained, records),
  };
}

function buildGeneration(run: KernelRun, generation: EvolutionGeneration, compiledId: Uuid): GenerationStep {
  const idSet = new Set(generation.candidateIds);
  const candidates = run.candidates.filter((candidate) => idSet.has(candidate.id));
  const records = run.fitnessRecords.filter((record) => idSet.has(record.candidateId));
  const measuredIds = new Set(records.map((record) => record.candidateId));
  return {
    generation: generation.generation,
    generate: { candidates: candidates.map((candidate) => toCandidate(candidate, measuredIds.has(candidate.id), undefined)) },
    fitness: { measured: records.map(toMeasurements) },
    selection: buildSelection(generation, records, compiledId),
  };
}

function buildLens(compiledRecord: FitnessRecord | undefined): LensResult {
  const lens = compiledRecord?.selection?.lens ?? { name: 'none', multiplier: 1, notes: [] };
  return {
    context: { actor: lens.name },
    score: lens.multiplier,
    threshold: 0.55,
    passed: lens.multiplier >= 0.55,
    reason: lens.notes.join(' ') || 'No operator lens applied after engine fitness.',
  };
}

function buildJudge(compiledId: Uuid, compiledRecord: FitnessRecord | undefined, falsifier: string): TraceJudgeStep {
  const axes = axesOf(compiledRecord);
  const rating = compiledRecord?.selection?.proposalRating.judge ?? 0;
  return {
    candidate_id: compiledId,
    result: {
      judge: rating,
      temporal: false,
      axes: [
        { axis: 'Novelty', score: Math.round(axes.novelty * 5), reasoning: 'Bridged from the novelty measurement.' },
        { axis: 'Grounding', score: Math.round(axes.grounding * 5), reasoning: 'Bridged from the grounding measurement.' },
        { axis: 'Falsifiability', score: 0, reasoning: falsifier || 'No falsifiability measurement in this run.' },
        { axis: 'Cost-efficiency', score: 0, reasoning: 'Judge-only axis; defaulted under the deterministic bridge.' },
        { axis: 'Relevance', score: 0, reasoning: 'Judge-only axis; defaulted under the deterministic bridge.' },
      ],
    },
  };
}

function discoveryInput(run: KernelRun): RunDiscoveryInput {
  const items: KnowledgePacketItem[] = run.knowledgePacket.items;
  return {
    field_id: run.knowledgePacket.targetCase,
    entries: items.map((item) => ({
      discovery_id: item.recordId,
      found: item.text,
      field: item.citation,
    })),
  };
}

export function buildRunTraces(run: KernelRun): RunTrace[] {
  const compiled = run.fusion?.child;
  if (!compiled) return [];

  const compiledRecord = run.fitnessRecords.find((record) => record.candidateId === compiled.id);
  const [seedA, seedB] = run.selectedParents;
  const syntheticGeneration: EvolutionGeneration = {
    generation: 0,
    candidateIds: run.candidates.map((candidate) => candidate.id),
    selectedParentIds: seedA && seedB ? [seedA.id, seedB.id] : [],
    childId: compiled.id,
    fitnessTotals: [],
  };
  const generationSource = run.evolution.length ? run.evolution : [syntheticGeneration];
  const [firstGeneration, ...restGenerations] = generationSource.map((generation) =>
    buildGeneration(run, generation, compiled.id),
  );
  if (!firstGeneration) return [];
  const generations: NonEmptyArray<GenerationStep> = [firstGeneration, ...restGenerations];

  const doppl = compileProposalNodes(run).find((node) => node.stage === 'doppl');
  const startedAt = eventTime(run.events, 'run.started') ?? new Date(0).toISOString();
  const completedAt = eventTime(run.events, 'run.completed') ?? startedAt;

  return [
    {
      identity: { run_id: run.id, stage: 'doppl', kernel: 'prime', started_at: startedAt, completed_at: completedAt },
      inputs: {
        parent_nodes: [run.caseStudy.id, run.problemRecovery.id],
        trace_synopses: [
          { stage: 'case_study', node_id: run.caseStudy.id, synopsis: run.caseStudy.statedProblem },
          { stage: 'problem_recovery', node_id: run.problemRecovery.id, synopsis: run.problemRecovery.recoveredProblem },
        ],
        discovery: discoveryInput(run),
      },
      generations,
      lens: buildLens(compiledRecord),
      judge: buildJudge(compiled.id, compiledRecord, run.problemRecovery.falsifier),
      compile: { output: { node_id: doppl?.id ?? compiled.id, ...(doppl?.path === undefined ? {} : { path: doppl.path }) } },
    },
  ];
}
