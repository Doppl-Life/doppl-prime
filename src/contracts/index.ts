// Defines the machine contracts shared by kernel modules.
export type Dial = 'diverge' | 'converge';

export type CandidateSubtype = 'cross_domain_transfer' | 'zeitgeist_synthesis';

export const RUN_TRACE_SCHEMA_VERSION = 'kernel.run-trace.v2';

export type SpaceKind = 'datastore' | 'module' | 'human' | 'artifact';

export type SpaceRef = {
  id: string;
  label: string;
  kind: SpaceKind;
};

export type ContractRef = {
  name: string;
  schemaId: string;
  direction: 'in' | 'out';
};

export type BoundaryContract = {
  module: string;
  entersFrom: SpaceRef;
  input: ContractRef;
  output: ContractRef;
  exitsTo: SpaceRef;
};

export type Seed = {
  id: string;
  title: string;
  prompt: string;
  thesis: string;
  goals: string[];
};

export type CandidateMetricInputs = {
  sourceAbsence: number;
  substrateDistance: number;
  hiddenDependents: number;
  signalStrength: number;
  mechanismClarity: number;
  falsifiability: number;
  riskPenalty: number;
};

export type CandidateDelta = {
  summary: string;
  changes: string[];
};

export type ParentRef = {
  kind: 'seed' | 'candidate';
  id: string;
};

export type RunCaps = {
  maxGenerations: number;
  maxChildrenPerParent: number;
  maxPopulation: number;
};

export const defaultRunCaps: RunCaps = {
  maxGenerations: 2,
  maxChildrenPerParent: 2,
  maxPopulation: 12,
};

export type ReproductionOperator = {
  id: string;
  label: string;
  description: string;
  defaultSubtype: CandidateSubtype;
};

export type SourcePacket = {
  id: string;
  operatorId: string;
  candidateId?: string;
  parentCandidateId?: string;
  generation?: number;
  title: string;
  substrate: string;
  mechanism: string;
  candidate?: {
    title: string;
    thesis: string;
    subtype?: CandidateSubtype;
  };
  delta?: CandidateDelta;
  claims?: string[];
  evidence?: string[];
  metrics?: CandidateMetricInputs;
  observedAt?: string;
  noDeltaReason?: string;
};

export type Candidate = {
  id: string;
  parentId: string;
  parent: ParentRef;
  generation: number;
  operatorId: string;
  operatorLabel: string;
  sourcePacketIds: string[];
  subtype: CandidateSubtype;
  title: string;
  thesis: string;
  substrate: string;
  mechanism: string;
  delta: CandidateDelta;
  claims: string[];
  evidence: string[];
  metricHints?: CandidateMetricInputs;
  observedAt?: string;
};

export type SeedFixture = {
  seed: Seed;
  asOf?: string;
  sourcePackets: SourcePacket[];
  operators: ReproductionOperator[];
};

export type CandidatePool = {
  seed: Seed;
  candidates: Candidate[];
  lineage: LineageLedger;
};

export type LineageNode = {
  id: string;
  parentId: string;
  parent: ParentRef;
  generation: number;
  operatorId: string;
  operatorLabel: string;
  sourcePacketIds: string[];
  title: string;
  delta?: CandidateDelta;
  status: 'generated' | 'rejected';
  rejectionReason?: string;
};

export type LineageLedger = {
  seedId: string;
  generated: LineageNode[];
  rejected: LineageNode[];
};

export type GenerationQuality = 'improved' | 'drifted' | 'duplicated' | 'not_run';

export type GenerationSummary = {
  index: number;
  parentCandidateIds: string[];
  generatedCandidateIds: string[];
  selectedCandidateIds: string[];
  rejectedNodeIds: string[];
  stoppedBy?: string;
  quality: GenerationQuality;
  detail: string;
};

export type ScoreInputRef = {
  kind: 'seed' | 'candidate' | 'source_packet' | 'claim' | 'evidence' | 'metric_hint';
  id: string;
  field?: string;
};

export type ScoreComponentDetail = {
  raw: number;
  weight: number;
  contribution: number;
  inputRefs: ScoreInputRef[];
};

export type ScoringPolicy = {
  id: string;
  version: string;
  componentWeights: {
    novelty: {
      sourceAbsence: number;
      substrateDistance: number;
      hiddenDependents: number;
    };
    grounding: {
      signalStrength: number;
      mechanismClarity: number;
      falsifiability: number;
      riskPenalty: number;
    };
  };
};

export type ScoreComputation = {
  policyId: string;
  inputRefs: ScoreInputRef[];
  warnings: string[];
};

export type DecayScore = {
  factor: number;
  halfLifeDays: number;
  ageDays: number;
  subtypeBasis: CandidateSubtype;
  reason: string;
};

export type FitnessScore = {
  policyId: string;
  novelty: number;
  grounding: number;
  decay: DecayScore;
  components: {
    sourceAbsence: number;
    substrateDistance: number;
    hiddenDependents: number;
    signalStrength: number;
    mechanismClarity: number;
    falsifiability: number;
    riskPenalty: number;
  };
  componentDetails: {
    sourceAbsence: ScoreComponentDetail;
    substrateDistance: ScoreComponentDetail;
    hiddenDependents: ScoreComponentDetail;
    signalStrength: ScoreComponentDetail;
    mechanismClarity: ScoreComponentDetail;
    falsifiability: ScoreComponentDetail;
    riskPenalty: ScoreComponentDetail;
  };
  reasons: {
    novelty: string;
    grounding: string;
    decay: string;
  };
  computation: ScoreComputation;
};

export type ScoredCandidate = Candidate & {
  fitness: FitnessScore;
};

export type ScoredCandidatePool = {
  seed: Seed;
  candidates: ScoredCandidate[];
};

export type SelectionSchedule = {
  dial: Dial;
  keep: number;
  priorityAxis: 'novelty' | 'grounding';
  floorAxis: 'novelty' | 'grounding';
  floor: number;
  decayPolicy: 'ignore' | 'apply_to_directional_score';
  description: string;
};

export type SelectedCandidate = ScoredCandidate & {
  selection: {
    front: number;
    rank: number;
    directionalScore: number;
    decayAdjustedScore: number;
    reason: string;
  };
};

export type DialContrast = {
  selectedId: string;
  status: 'stable' | 'replaced' | 'dropped';
  alternateId?: string;
  reason: string;
};

export type SelectionResult = {
  schedule: SelectionSchedule;
  selected: SelectedCandidate[];
  rejected: SelectedCandidate[];
};

export type SelectionComparison = {
  focus: SelectionResult;
  alternate: SelectionResult;
  contrasts: DialContrast[];
};

export type GoalCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type LensConfig = {
  id: string;
  label: string;
  observerRef: string;
};

export type LensScore = {
  lensId: string;
  candidateId: string;
  score: number;
  passed: boolean;
  components: {
    demoFit: number;
    evidenceFit: number;
    scopeFit: number;
    riskFit: number;
  };
  reasons: string[];
  inputRefs: ScoreInputRef[];
};

export type LensResult = {
  lensId: string;
  label: string;
  scores: LensScore[];
};

export type TraceEvent = {
  stage: string;
  input: string;
  decision: string;
  reason: string;
  output: string;
  goalChecks: GoalCheck[];
  boundary?: BoundaryContract;
};

export type RunTrace = {
  schemaVersion: string;
  runId: string;
  dial: Dial;
  seed: Seed;
  caps: RunCaps;
  candidateCount: number;
  lineage: LineageLedger;
  generations: GenerationSummary[];
  boundaryContracts: BoundaryContract[];
  events: TraceEvent[];
  goalChecks: GoalCheck[];
  comparison: SelectionComparison;
  lensResults: LensResult[];
  terminalReason: string;
};

export const boundaryContracts: BoundaryContract[] = [
  {
    module: 'generate',
    entersFrom: { id: 'fixture-seed-store', label: 'FixtureSeedStore', kind: 'datastore' },
    input: { name: 'SeedFixture', schemaId: 'kernel.seed-fixture.v2', direction: 'in' },
    output: { name: 'CandidatePool', schemaId: 'kernel.candidate-pool.v2', direction: 'out' },
    exitsTo: { id: 'fitness', label: 'fitness', kind: 'module' },
  },
  {
    module: 'fitness',
    entersFrom: { id: 'generate', label: 'generate', kind: 'module' },
    input: { name: 'CandidatePool', schemaId: 'kernel.candidate-pool.v2', direction: 'in' },
    output: { name: 'ScoredCandidatePool', schemaId: 'kernel.scored-candidate-pool.v2', direction: 'out' },
    exitsTo: { id: 'select', label: 'select', kind: 'module' },
  },
  {
    module: 'select',
    entersFrom: { id: 'fitness', label: 'fitness', kind: 'module' },
    input: { name: 'ScoredCandidatePool + SelectionSchedule', schemaId: 'kernel.selection-input.v2', direction: 'in' },
    output: { name: 'SelectionComparison', schemaId: 'kernel.selection-comparison.v2', direction: 'out' },
    exitsTo: { id: 'lens', label: 'lens', kind: 'module' },
  },
  {
    module: 'lens',
    entersFrom: { id: 'select', label: 'select', kind: 'module' },
    input: { name: 'ScoredCandidatePool + SelectionComparison', schemaId: 'kernel.lens-input.v1', direction: 'in' },
    output: { name: 'LensResult[]', schemaId: 'kernel.lens-result.v1', direction: 'out' },
    exitsTo: { id: 'trace', label: 'trace', kind: 'module' },
  },
  {
    module: 'trace',
    entersFrom: { id: 'lens', label: 'lens', kind: 'module' },
    input: { name: 'KernelRun + LensResult[]', schemaId: 'kernel.run.v2', direction: 'in' },
    output: { name: 'RunTrace', schemaId: RUN_TRACE_SCHEMA_VERSION, direction: 'out' },
    exitsTo: { id: 'microscope-tools', label: 'MicroscopeTools', kind: 'artifact' },
  },
];

export function getBoundary(module: string): BoundaryContract {
  const boundary = boundaryContracts.find((item) => item.module === module);
  if (!boundary) {
    throw new Error(`Unknown boundary: ${module}`);
  }
  return boundary;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

export function assertSeedFixture(value: unknown): SeedFixture {
  if (!value || typeof value !== 'object') {
    throw new Error('Seed fixture must be an object.');
  }
  const fixture = value as SeedFixture;
  if (!fixture.seed || !Array.isArray(fixture.sourcePackets) || !Array.isArray(fixture.operators)) {
    throw new Error('Seed fixture must contain seed, sourcePackets, and operators.');
  }
  if (!fixture.seed.id || !fixture.seed.title || !fixture.seed.prompt || !fixture.seed.thesis || !Array.isArray(fixture.seed.goals)) {
    throw new Error('Seed is missing id, title, prompt, thesis, or goals.');
  }
  const operatorIds = new Set(fixture.operators.map((operator) => operator.id));
  for (const operator of fixture.operators) {
    if (!operator.id || !operator.label || !operator.defaultSubtype) {
      throw new Error(`Operator is missing required fields: ${operator.id || '<unknown>'}`);
    }
    if (operator.defaultSubtype !== 'cross_domain_transfer' && operator.defaultSubtype !== 'zeitgeist_synthesis') {
      throw new Error(`Operator has invalid subtype: ${operator.id}`);
    }
  }
  for (const packet of fixture.sourcePackets) {
    if (!packet.id || !packet.operatorId || !packet.title || !packet.substrate || !packet.mechanism) {
      throw new Error(`Source packet is missing required fields: ${packet.id || '<unknown>'}`);
    }
    if (!operatorIds.has(packet.operatorId)) {
      throw new Error(`Source packet references unknown operator: ${packet.id} -> ${packet.operatorId}`);
    }
    if (packet.noDeltaReason) continue;
    if (!packet.candidateId || !packet.candidate?.title || !packet.candidate.thesis || !packet.delta) {
      throw new Error(`Generated source packet is missing candidate fields: ${packet.id}`);
    }
    if (packet.candidate.subtype &&
      packet.candidate.subtype !== 'cross_domain_transfer' &&
      packet.candidate.subtype !== 'zeitgeist_synthesis') {
      throw new Error(`Source packet has invalid candidate subtype: ${packet.id}`);
    }
    if (!packet.delta.changes.length) {
      throw new Error(`Generated source packet must state at least one delta change: ${packet.id}`);
    }
  }
  return fixture;
}
