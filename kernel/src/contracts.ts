import type { ModelCallRecord } from './model-gateway.ts';

export type MemoryMode = 'off' | 'auto' | 'pinned';

export type CaseStudy = {
  id: string;
  title: string;
  sourcePath: string;
  markdown: string;
  statedProblem: string;
};

export type KnowledgePacketItem = {
  recordId: string;
  citeHandle: string;
  text: string;
  sourceCase: string;
  citation: string;
  trustTier: string;
  visibility: string;
};

export type KnowledgePacket = {
  id: string;
  targetCase: string;
  items: KnowledgePacketItem[];
  excluded: Array<{ reason: string; case?: string; recordId?: string }>;
};

export type ProblemRecovery = {
  id: string;
  caseId: string;
  title: string;
  recoveredProblem: string;
  hiddenConstraint: string;
  falsifier: string;
  citedKnowledge: string[];
};

export type CandidateSolution = {
  id: string;
  caseId: string;
  agenomeId: string;
  generation: number;
  title: string;
  summary: string;
  mechanism: string;
  claimedDelta: string;
  citedKnowledge: string[];
};

export type Agenome = {
  id: string;
  label: string;
  prompt: string;
  persona: string;
  valueWeights: {
    novelty: number;
    grounding: number;
    feasibility: number;
    skepticism: number;
  };
  toolPermissions: string[];
  decompositionPolicy: string;
  spawnBudget: {
    maxCandidates: number;
    maxToolCalls: number;
  };
  parentAgenomeIds: string[];
  mutations: string[];
  energy: {
    allocated: number;
    spent: number;
    remaining: number;
  };
  candidateIds: string[];
  generations: number[];
};

export type AgenomeEnergyLedgerEntry = {
  id: string;
  agenomeId: string;
  generation: number;
  kind: 'allocation' | 'spend';
  units: number;
  reason: string;
  candidateId?: string;
};

export type CriticVerdict = {
  candidateId: string;
  criticId: string;
  score: number;
  pressure: string;
  revisionMandate: string;
};

export type FitnessRecord = {
  candidateId: string;
  total: number;
  components: {
    novelty: number;
    grounding: number;
    mechanismClarity: number;
    mechanismCost: number;
    criticPressure: number;
    evidenceQuality: number;
  };
  selection?: {
    axes: {
      novelty: number;
      grounding: number;
    };
    weights: {
      novelty: number;
      grounding: number;
    };
    dial: 'diverge' | 'balanced' | 'converge';
    generation: number;
    decay: number;
    lens: {
      name: string;
      multiplier: number;
      notes: string[];
    };
    proposalRating: {
      scale: '-5_to_5';
      judge: number;
      source: string;
    };
    frontier: {
      pareto: boolean;
      rank: number;
      dominatedBy: string[];
    };
  };
  rationale: string;
};

export type PairCompatibility = {
  parentA: string;
  parentB: string;
  score: number;
  rationale: string;
};

export type InheritanceWeights = {
  parentA: number;
  parentB: number;
};

export type FusionResult = {
  child: CandidateSolution;
  parentCandidateIds: [string, string];
  compatibility: PairCompatibility;
  inheritanceWeights: InheritanceWeights;
  inheritedTraits: string[];
  mutationNotes: string[];
};

export type EvolutionGeneration = {
  generation: number;
  candidateIds: string[];
  selectedParentIds: [string, string] | [];
  childId?: string;
  fitnessTotals: Array<{ candidateId: string; total: number }>;
};

export type EvolutionBudget = {
  maxUnits: number;
  usedUnits: number;
  remainingUnits: number;
  exhausted: boolean;
};

export const RUN_EVENT_SCHEMA_VERSION = 1;

export const RUN_EVENT_ACTORS = [
  'operator',
  'runtime',
  'agenome',
  'critic',
  'check_runner',
  'selection_controller',
  'system',
] as const;

export type RunEventActor = (typeof RUN_EVENT_ACTORS)[number];

export const RUN_EVENT_TYPES = [
  'run.started',
  'run.completed',
  'run.failed',
  'run.stopped',
  'knowledge.packet_requested',
  'knowledge.packet_selected',
  'knowledge.item_injected',
  'agenome.materialized',
  'agenome.energy_allocated',
  'agenome.energy_spent',
  'problem_recovery.created',
  'control_baseline.created',
  'control_baseline.scored',
  'generation.started',
  'generation.completed',
  'evolution.budget_exhausted',
  'candidate.created',
  'critic.verdict_recorded',
  'fitness.scored',
  'pair.compatibility_checked',
  'candidate.fused',
  'model.operation_started',
  'model.output_accepted',
  'model.output_repair_requested',
  'model.output_repaired',
  'model.output_rejected',
] as const;

export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

export type RunEvent = {
  index: number;
  id?: string;
  runId?: string;
  generationId?: string;
  agenomeId?: string;
  candidateId?: string;
  type: RunEventType | string;
  sequence?: number;
  occurredAt?: string;
  actor?: RunEventActor;
  correlationId?: string;
  langfuseTraceId?: string;
  langfuseObservationId?: string;
  payload: Record<string, unknown>;
  schemaVersion?: number;
};

export type VaultExportManifest = {
  rootDir: string;
  files: string[];
};

export type KernelRun = {
  id: string;
  caseStudy: CaseStudy;
  memoryMode: MemoryMode;
  knowledgePacket: KnowledgePacket;
  energyLedger: AgenomeEnergyLedgerEntry[];
  agenomes: Agenome[];
  problemRecovery: ProblemRecovery;
  controlBaseline?: CandidateSolution;
  candidates: CandidateSolution[];
  criticVerdicts: CriticVerdict[];
  fitnessRecords: FitnessRecord[];
  selectedParents: [CandidateSolution, CandidateSolution] | [];
  fusion?: FusionResult;
  fusionChildren: FusionResult[];
  evolution: EvolutionGeneration[];
  budget: EvolutionBudget;
  events: RunEvent[];
  modelCallRecords?: ModelCallRecord[];
  vaultExport?: VaultExportManifest;
};

export function calculateInheritanceWeights(
  parentAScore: number,
  parentBScore: number,
): InheritanceWeights {
  const safeA = Math.max(parentAScore, 0);
  const safeB = Math.max(parentBScore, 0);
  const total = safeA + safeB;
  if (total === 0) return { parentA: 0.5, parentB: 0.5 };
  return {
    parentA: Number((safeA / total).toFixed(3)),
    parentB: Number((safeB / total).toFixed(3)),
  };
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertStringField(value: Record<string, unknown>, field: string, label: string): void {
  if (typeof value[field] !== 'string' || value[field].length === 0) {
    throw new Error(`${label}.${field} is required`);
  }
}

function assertStringArrayField(value: Record<string, unknown>, field: string, label: string): void {
  if (!Array.isArray(value[field]) || !value[field].every((item) => typeof item === 'string')) {
    throw new Error(`${label}.${field} must be a string array`);
  }
}

function assertNumberRangeField(
  value: Record<string, unknown>,
  field: string,
  label: string,
  min: number,
  max: number,
): void {
  const number = value[field];
  if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label}.${field} must be a number from ${min} to ${max}`);
  }
}

function assertIntegerMinField(
  value: Record<string, unknown>,
  field: string,
  label: string,
  min: number,
): void {
  const number = value[field];
  if (!Number.isInteger(number) || (number as number) < min) {
    throw new Error(`${label}.${field} must be an integer >= ${min}`);
  }
}

export function assertKnowledgePacket(value: unknown): KnowledgePacket {
  const packet = assertObject(value, 'KnowledgePacket');
  assertStringField(packet, 'id', 'KnowledgePacket');
  assertStringField(packet, 'targetCase', 'KnowledgePacket');
  if (!Array.isArray(packet.items)) throw new Error('KnowledgePacket.items must be an array');
  packet.items.forEach((item, index) => {
    const record = assertObject(item, `KnowledgePacket.items[${index}]`);
    for (const field of [
      'recordId',
      'citeHandle',
      'text',
      'sourceCase',
      'citation',
      'trustTier',
      'visibility',
    ]) {
      assertStringField(record, field, `KnowledgePacket.items[${index}]`);
    }
  });
  if (!Array.isArray(packet.excluded)) throw new Error('KnowledgePacket.excluded must be an array');
  return packet as KnowledgePacket;
}

export function assertProblemRecovery(value: unknown): ProblemRecovery {
  const recovery = assertObject(value, 'ProblemRecovery');
  for (const field of [
    'id',
    'caseId',
    'title',
    'recoveredProblem',
    'hiddenConstraint',
    'falsifier',
  ]) {
    assertStringField(recovery, field, 'ProblemRecovery');
  }
  assertStringArrayField(recovery, 'citedKnowledge', 'ProblemRecovery');
  return recovery as ProblemRecovery;
}

export function assertCandidateSolution(value: unknown): CandidateSolution {
  const candidate = assertObject(value, 'CandidateSolution');
  for (const field of [
    'id',
    'caseId',
    'agenomeId',
    'title',
    'summary',
    'mechanism',
    'claimedDelta',
  ]) {
    assertStringField(candidate, field, 'CandidateSolution');
  }
  assertIntegerMinField(candidate, 'generation', 'CandidateSolution', 0);
  assertStringArrayField(candidate, 'citedKnowledge', 'CandidateSolution');
  return candidate as CandidateSolution;
}

export function assertAgenome(value: unknown): Agenome {
  const agenome = assertObject(value, 'Agenome');
  for (const field of ['id', 'label', 'prompt', 'persona', 'decompositionPolicy']) {
    assertStringField(agenome, field, 'Agenome');
  }
  const valueWeights = assertObject(agenome.valueWeights, 'Agenome.valueWeights');
  for (const field of ['novelty', 'grounding', 'feasibility', 'skepticism']) {
    assertNumberRangeField(valueWeights, field, 'Agenome.valueWeights', 0, 1);
  }
  assertStringArrayField(agenome, 'toolPermissions', 'Agenome');
  const spawnBudget = assertObject(agenome.spawnBudget, 'Agenome.spawnBudget');
  assertIntegerMinField(spawnBudget, 'maxCandidates', 'Agenome.spawnBudget', 0);
  assertIntegerMinField(spawnBudget, 'maxToolCalls', 'Agenome.spawnBudget', 0);
  assertStringArrayField(agenome, 'parentAgenomeIds', 'Agenome');
  assertStringArrayField(agenome, 'mutations', 'Agenome');
  const energy = assertObject(agenome.energy, 'Agenome.energy');
  assertNumberRangeField(energy, 'allocated', 'Agenome.energy', 0, Number.MAX_SAFE_INTEGER);
  assertNumberRangeField(energy, 'spent', 'Agenome.energy', 0, Number.MAX_SAFE_INTEGER);
  assertNumberRangeField(energy, 'remaining', 'Agenome.energy', 0, Number.MAX_SAFE_INTEGER);
  assertStringArrayField(agenome, 'candidateIds', 'Agenome');
  if (!Array.isArray(agenome.generations) || !agenome.generations.every(Number.isInteger)) {
    throw new Error('Agenome.generations must be an integer array');
  }
  return agenome as Agenome;
}

export function assertAgenomeEnergyLedgerEntry(value: unknown): AgenomeEnergyLedgerEntry {
  const entry = assertObject(value, 'AgenomeEnergyLedgerEntry');
  for (const field of ['id', 'agenomeId', 'kind', 'reason']) {
    assertStringField(entry, field, 'AgenomeEnergyLedgerEntry');
  }
  assertIntegerMinField(entry, 'generation', 'AgenomeEnergyLedgerEntry', 0);
  assertNumberRangeField(entry, 'units', 'AgenomeEnergyLedgerEntry', 0, Number.MAX_SAFE_INTEGER);
  if (entry.kind !== 'allocation' && entry.kind !== 'spend') {
    throw new Error('AgenomeEnergyLedgerEntry.kind must be allocation or spend');
  }
  if (entry.candidateId !== undefined) assertStringField(entry, 'candidateId', 'AgenomeEnergyLedgerEntry');
  return entry as AgenomeEnergyLedgerEntry;
}

export function assertCriticVerdict(value: unknown): CriticVerdict {
  const verdict = assertObject(value, 'CriticVerdict');
  for (const field of ['candidateId', 'criticId', 'pressure', 'revisionMandate']) {
    assertStringField(verdict, field, 'CriticVerdict');
  }
  assertNumberRangeField(verdict, 'score', 'CriticVerdict', 0, 100);
  return verdict as CriticVerdict;
}

export function assertFitnessRecord(value: unknown): FitnessRecord {
  const record = assertObject(value, 'FitnessRecord');
  assertStringField(record, 'candidateId', 'FitnessRecord');
  assertNumberRangeField(record, 'total', 'FitnessRecord', 0, 100);
  const components = assertObject(record.components, 'FitnessRecord.components');
  for (const field of [
    'novelty',
    'grounding',
    'mechanismClarity',
    'mechanismCost',
    'criticPressure',
    'evidenceQuality',
  ]) {
    assertNumberRangeField(components, field, 'FitnessRecord.components', 0, 100);
  }
  if (record.selection !== undefined) {
    const selection = assertObject(record.selection, 'FitnessRecord.selection');
    const axes = assertObject(selection.axes, 'FitnessRecord.selection.axes');
    assertNumberRangeField(axes, 'novelty', 'FitnessRecord.selection.axes', 0, 1);
    assertNumberRangeField(axes, 'grounding', 'FitnessRecord.selection.axes', 0, 1);
    const weights = assertObject(selection.weights, 'FitnessRecord.selection.weights');
    assertNumberRangeField(weights, 'novelty', 'FitnessRecord.selection.weights', 0, 1);
    assertNumberRangeField(weights, 'grounding', 'FitnessRecord.selection.weights', 0, 1);
    assertStringField(selection, 'dial', 'FitnessRecord.selection');
    assertIntegerMinField(selection, 'generation', 'FitnessRecord.selection', 0);
    assertNumberRangeField(selection, 'decay', 'FitnessRecord.selection', 0, 1);
    const lens = assertObject(selection.lens, 'FitnessRecord.selection.lens');
    assertStringField(lens, 'name', 'FitnessRecord.selection.lens');
    assertNumberRangeField(lens, 'multiplier', 'FitnessRecord.selection.lens', 0, 1);
    assertStringArrayField(lens, 'notes', 'FitnessRecord.selection.lens');
    const proposalRating = assertObject(
      selection.proposalRating,
      'FitnessRecord.selection.proposalRating',
    );
    assertStringField(proposalRating, 'scale', 'FitnessRecord.selection.proposalRating');
    assertNumberRangeField(proposalRating, 'judge', 'FitnessRecord.selection.proposalRating', -5, 5);
    assertStringField(proposalRating, 'source', 'FitnessRecord.selection.proposalRating');
    const frontier = assertObject(selection.frontier, 'FitnessRecord.selection.frontier');
    if (typeof frontier.pareto !== 'boolean') {
      throw new Error('FitnessRecord.selection.frontier.pareto must be a boolean');
    }
    assertIntegerMinField(frontier, 'rank', 'FitnessRecord.selection.frontier', 1);
    assertStringArrayField(frontier, 'dominatedBy', 'FitnessRecord.selection.frontier');
  }
  assertStringField(record, 'rationale', 'FitnessRecord');
  return record as FitnessRecord;
}

export function assertPairCompatibility(value: unknown): PairCompatibility {
  const compatibility = assertObject(value, 'PairCompatibility');
  assertStringField(compatibility, 'parentA', 'PairCompatibility');
  assertStringField(compatibility, 'parentB', 'PairCompatibility');
  assertNumberRangeField(compatibility, 'score', 'PairCompatibility', 0, 100);
  assertStringField(compatibility, 'rationale', 'PairCompatibility');
  return compatibility as PairCompatibility;
}

export function assertFusionResult(value: unknown): FusionResult {
  const fusion = assertObject(value, 'FusionResult');
  assertCandidateSolution(fusion.child);
  if (!Array.isArray(fusion.parentCandidateIds) || fusion.parentCandidateIds.length !== 2) {
    throw new Error('FusionResult.parentCandidateIds must contain exactly two ids');
  }
  if (!fusion.parentCandidateIds.every((id) => typeof id === 'string' && id.length > 0)) {
    throw new Error('FusionResult.parentCandidateIds must contain exactly two ids');
  }
  assertPairCompatibility(fusion.compatibility);
  const weights = assertObject(fusion.inheritanceWeights, 'FusionResult.inheritanceWeights');
  assertNumberRangeField(weights, 'parentA', 'FusionResult.inheritanceWeights', 0, 1);
  assertNumberRangeField(weights, 'parentB', 'FusionResult.inheritanceWeights', 0, 1);
  assertStringArrayField(fusion, 'inheritedTraits', 'FusionResult');
  assertStringArrayField(fusion, 'mutationNotes', 'FusionResult');
  return fusion as FusionResult;
}

export function assertKernelRun(value: unknown): KernelRun {
  const run = value as Partial<KernelRun>;
  if (!run || typeof run !== 'object') throw new Error('KernelRun must be an object');
  if (!run.id) throw new Error('KernelRun.id is required');
  if (!run.problemRecovery) throw new Error('KernelRun.problemRecovery is required');
  if (!run.caseStudy) throw new Error('KernelRun.caseStudy is required');
  if (!Array.isArray(run.events)) throw new Error('KernelRun.events is required');
  assertProblemRecovery(run.problemRecovery);
  assertKnowledgePacket(run.knowledgePacket);
  if (!Array.isArray(run.energyLedger)) throw new Error('KernelRun.energyLedger is required');
  for (const entry of run.energyLedger) assertAgenomeEnergyLedgerEntry(entry);
  if (!Array.isArray(run.agenomes)) throw new Error('KernelRun.agenomes is required');
  for (const agenome of run.agenomes) assertAgenome(agenome);
  if (run.controlBaseline) assertCandidateSolution(run.controlBaseline);
  for (const candidate of run.candidates || []) assertCandidateSolution(candidate);
  for (const verdict of run.criticVerdicts || []) assertCriticVerdict(verdict);
  for (const fitness of run.fitnessRecords || []) assertFitnessRecord(fitness);
  if (run.fusion) assertFusionResult(run.fusion);
  if (!Array.isArray(run.fusionChildren)) throw new Error('KernelRun.fusionChildren is required');
  for (const fusionChild of run.fusionChildren) assertFusionResult(fusionChild);
  if (!Array.isArray(run.evolution)) throw new Error('KernelRun.evolution is required');
  const budget = assertObject(run.budget, 'KernelRun.budget');
  assertIntegerMinField(budget, 'maxUnits', 'KernelRun.budget', 0);
  assertIntegerMinField(budget, 'usedUnits', 'KernelRun.budget', 0);
  assertIntegerMinField(budget, 'remainingUnits', 'KernelRun.budget', 0);
  return run as KernelRun;
}
