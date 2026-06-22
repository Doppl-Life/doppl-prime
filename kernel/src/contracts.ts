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
  events: RunEvent[];
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

export function assertKernelRun(value: unknown): KernelRun {
  const run = value as Partial<KernelRun>;
  if (!run || typeof run !== 'object') throw new Error('KernelRun must be an object');
  if (!run.id) throw new Error('KernelRun.id is required');
  if (!run.problemRecovery) throw new Error('KernelRun.problemRecovery is required');
  if (!run.caseStudy) throw new Error('KernelRun.caseStudy is required');
  if (!Array.isArray(run.events)) throw new Error('KernelRun.events is required');
  return run as KernelRun;
}
