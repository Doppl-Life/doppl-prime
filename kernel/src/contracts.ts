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

export type RunEvent = {
  index: number;
  type: string;
  payload: Record<string, unknown>;
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
  problemRecovery: ProblemRecovery;
  candidates: CandidateSolution[];
  criticVerdicts: CriticVerdict[];
  fitnessRecords: FitnessRecord[];
  selectedParents: [CandidateSolution, CandidateSolution] | [];
  fusion?: FusionResult;
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
  for (const candidate of run.candidates || []) assertCandidateSolution(candidate);
  for (const verdict of run.criticVerdicts || []) assertCriticVerdict(verdict);
  for (const fitness of run.fitnessRecords || []) assertFitnessRecord(fitness);
  if (run.fusion) assertFusionResult(run.fusion);
  if (!Array.isArray(run.evolution)) throw new Error('KernelRun.evolution is required');
  const budget = assertObject(run.budget, 'KernelRun.budget');
  assertIntegerMinField(budget, 'maxUnits', 'KernelRun.budget', 0);
  assertIntegerMinField(budget, 'usedUnits', 'KernelRun.budget', 0);
  assertIntegerMinField(budget, 'remainingUnits', 'KernelRun.budget', 0);
  return run as KernelRun;
}
