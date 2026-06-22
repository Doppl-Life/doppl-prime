export type CrucibleConsensusQuality = 'resolved' | 'herded' | 'mixed';
export type CrucibleVerdict = 'pass' | 'needs-revision';

export type CrucibleTurnMove =
  | 'object'
  | 'steal'
  | 'change-test'
  | 'hold-or-fold';

export type CrucibleArchetypeId =
  | 'transfer-hunter'
  | 'feasibility-hawk'
  | 'falsifier'
  | 'contrarian'
  | 'zeitgeist-reader'
  | 'breakout'
  | 'blindside'
  | 'first-principles'
  | 'constraint-injection'
  | 'polymath'
  | 'addition-by-subtraction';

export type CrucibleArchetype = {
  id: CrucibleArchetypeId;
  name: string;
  mandate: string;
  disagreeableness: number;
};

export type RevisionLedger = {
  heldBefore: string;
  changed: string;
  evidenceMovedMe: string;
  stillReject: string;
};

export type CrucibleFinal = {
  finalPosition: string;
  confidence: 'low' | 'medium' | 'high';
  revisionLedger: RevisionLedger;
};

export type CrucibleJudge = {
  survivingIdea: string;
  whyItSurvived: string;
  consensusQuality: CrucibleConsensusQuality;
  consensusNote: string;
  bestRevision: {
    who: string;
    whatChanged: string;
    earned: boolean;
  };
  performativeFlips: string[];
  unresolvedTension: string[];
  score: number;
  verdict: CrucibleVerdict;
};

export type CrucibleCalibrationRun = {
  id: string;
  prompt: string;
  roster: CrucibleArchetypeId[];
  survivingIdea: string;
  consensusQuality: CrucibleConsensusQuality;
  unresolvedTension: string[];
  score: number;
  verdict: CrucibleVerdict;
};

export const crucibleTurnProtocol: CrucibleTurnMove[] = [
  'object',
  'steal',
  'change-test',
  'hold-or-fold',
];

export const crucibleInvariants = [
  'score earned belief revision, not agreement',
  'each turn must force objection, theft of a strong peer point, change-test, and hold-or-fold',
  'final answers must include a revision ledger',
  'the judge must preserve unresolved tension instead of smoothing it away',
  'herded consensus caps epistemic score',
  'spawncidence count is bounded by metabolism',
] as const;

export const crucibleArchetypes: CrucibleArchetype[] = [
  {
    id: 'transfer-hunter',
    name: 'Transfer Hunter',
    mandate: 'find cross-domain analogies that crack the problem',
    disagreeableness: 0.5,
  },
  {
    id: 'feasibility-hawk',
    name: 'Feasibility Hawk',
    mandate: 'stress two-week shippability and real constraints',
    disagreeableness: 0.55,
  },
  {
    id: 'falsifier',
    name: 'Falsifier',
    mandate: 'hunt the flaw others avoid',
    disagreeableness: 0.85,
  },
  {
    id: 'contrarian',
    name: 'Contrarian',
    mandate: 'reject the obvious direction and name the buried assumption',
    disagreeableness: 0.8,
  },
  {
    id: 'zeitgeist-reader',
    name: 'Zeitgeist Reader',
    mandate: 'sense what the moment rewards and synthesize the strongest signal',
    disagreeableness: 0.3,
  },
  {
    id: 'breakout',
    name: 'Breakout',
    mandate: 'hunt the paradigm-escaping zag',
    disagreeableness: 0.35,
  },
  {
    id: 'blindside',
    name: 'Blindside',
    mandate: 'find the non-obvious failure mode or the honest case against doing it',
    disagreeableness: 0.85,
  },
  {
    id: 'first-principles',
    name: 'First Principles',
    mandate: 'strip inherited frames to bedrock invariants',
    disagreeableness: 0.6,
  },
  {
    id: 'constraint-injection',
    name: 'Constraint Injection',
    mandate: 'add the binding constraint that forces specificity',
    disagreeableness: 0.5,
  },
  {
    id: 'polymath',
    name: 'Polymath',
    mandate: 'transplant a proven mechanism from a distant field',
    disagreeableness: 0.45,
  },
  {
    id: 'addition-by-subtraction',
    name: 'Addition by Subtraction',
    mandate: 'find the single highest-leverage removal',
    disagreeableness: 0.6,
  },
];

export const crucibleCalibrationRuns: CrucibleCalibrationRun[] = [
  {
    id: 'baseline-default-roster',
    prompt: 'A startup wants to build an AI app that summarizes your unread group chats. What is the single most important move right now?',
    roster: ['transfer-hunter', 'feasibility-hawk', 'falsifier'],
    survivingIdea:
      'Build a minimum viable export parser for manual chat dumps, focused on identifying implied consensus rather than generic summaries.',
    consensusQuality: 'resolved',
    unresolvedTension: [
      'Utility and access remain separate risks: the MVP proves cognitive value, but scaling requires solving platform walls.',
    ],
    score: 8,
    verdict: 'pass',
  },
  {
    id: 'mutagen-roster',
    prompt: 'A startup wants to build an AI app that summarizes your unread group chats. What is the single most important move right now?',
    roster: ['polymath', 'addition-by-subtraction', 'blindside'],
    survivingIdea:
      'Build a structured context protocol that tags chat intent, extracts commitments, and flags relational context gaps instead of summarizing noise.',
    consensusQuality: 'resolved',
    unresolvedTension: [
      'The balance between professional accountability and emotionally valuable personal memory remains open.',
      'The protocol layer must avoid feeling like surveillance.',
    ],
    score: 9,
    verdict: 'pass',
  },
];

export function validateCrucibleJudge(judge: Pick<CrucibleJudge, 'consensusQuality' | 'score' | 'unresolvedTension' | 'verdict'>): string[] {
  const errors: string[] = [];
  if (judge.score < 1 || judge.score > 10) errors.push('score must be 1..10');
  if (judge.consensusQuality === 'herded' && judge.score > 6) {
    errors.push('herded consensus cannot score above 6');
  }
  if (judge.unresolvedTension.length === 0 && judge.score > 6) {
    errors.push('high-scoring crucible must preserve unresolved tension');
  }
  if ((judge.consensusQuality === 'herded' || judge.unresolvedTension.length === 0) && judge.verdict === 'pass' && judge.score > 6) {
    errors.push('pass verdict is inconsistent with herding/empty-tension signals');
  }
  return errors;
}

export function calibrationSummary(runs: CrucibleCalibrationRun[] = crucibleCalibrationRuns): {
  runs: number;
  bestRunId: string;
  scoreDelta: number;
  tensionDelta: number;
  allPass: boolean;
} {
  const sorted = runs.slice().sort((a, b) => b.score - a.score);
  const baseline = runs.find((run) => run.id === 'baseline-default-roster') || runs[0];
  const best = sorted[0];
  return {
    runs: runs.length,
    bestRunId: best.id,
    scoreDelta: best.score - baseline.score,
    tensionDelta: best.unresolvedTension.length - baseline.unresolvedTension.length,
    allPass: runs.every((run) => validateCrucibleJudge(run).length === 0),
  };
}

export function archetypeById(id: CrucibleArchetypeId): CrucibleArchetype {
  const archetype = crucibleArchetypes.find((item) => item.id === id);
  if (!archetype) throw new Error(`Unknown crucible archetype: ${id}`);
  return archetype;
}
