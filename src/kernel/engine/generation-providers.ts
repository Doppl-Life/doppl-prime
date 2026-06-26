import {
  assertCandidateSolution,
  assertCriticVerdict,
  JUDGE_AXES,
  type Agenome,
  type CandidateSolution,
  type CaseStudy,
  type CriticVerdict,
  type GrowthStage,
  type HeldOutJudgeResult,
  type JudgeAxis,
  type KnowledgePacket,
  type Mutagen,
  type NodeSummary,
} from '../boundary.ts';
import { loadKernelFixture } from '../fixtures.ts';
import { parseJsonObjectResponse, type ModelCallRecord, type ModelClient } from '../model/model-gateway.ts';

const DIVERGE_MUTAGENS: readonly [Mutagen, Mutagen, Mutagen] = ['breakout', 'blindside', 'polymath'];
const CONVERGE_MUTAGENS: readonly [Mutagen, Mutagen, Mutagen] = [
  'constraint-injection',
  'breakthrough',
  'first-principles',
];
const BALANCED_MUTAGENS: readonly [Mutagen, Mutagen, Mutagen] = [
  'constraint-injection',
  'blindside',
  'breakout',
];

// The self-regulating tide: a converged population (critic scores bunched together) reaches
// for divergence mutagens to escape the crowd; a scattered one consolidates. Observed from
// the population's state, never dialed. Scale-independent so it survives any score range.
export function regimeMutagens(verdicts: CriticVerdict[]): readonly [Mutagen, Mutagen, Mutagen] {
  const scores = verdicts.map((verdict) => verdict.score);
  const max = scores.length ? Math.max(...scores) : 0;
  if (scores.length < 2 || max <= 0) return BALANCED_MUTAGENS;
  const relativeSpread = (max - Math.min(...scores)) / max;
  if (relativeSpread <= 0.2) return DIVERGE_MUTAGENS;
  if (relativeSpread >= 0.6) return CONVERGE_MUTAGENS;
  return BALANCED_MUTAGENS;
}

// Each mutagen's variation applied to a parent candidate, given the prior survivor and a
// knowledge handle. The seven moves correspond to the .cursor/skills mutagens.
function mutagenMove(
  mutagen: Mutagen,
  source: Pick<CandidateSolution, 'title' | 'mechanism'>,
  previousTitle: string,
  handle: string,
): { tag: string; summary: string; mechanism: string; claimedDelta: string } {
  switch (mutagen) {
    case 'constraint-injection':
      return {
        tag: 'constraint',
        summary: `Mutates ${previousTitle} into a stricter ${source.title} test.`,
        mechanism: `${source.mechanism} It must now satisfy a tighter mandate.`,
        claimedDelta: `Keeps the survivor only if its strongest mechanism survives new pressure.`,
      };
    case 'blindside':
      return {
        tag: 'blindside',
        summary: `Turns the prior critic mandate into a falsifier against ${previousTitle}.`,
        mechanism: `${source.mechanism} It attacks the survivor through its weakest assumption.`,
        claimedDelta: `Adds a failure mode instead of re-running the parent.`,
      };
    case 'breakout':
      return {
        tag: 'breakout',
        summary: `Escapes the frame around ${previousTitle} toward a different signal.`,
        mechanism: `${source.mechanism} It is redirected toward evidence from ${handle}.`,
        claimedDelta: `Broadens the search without collapsing to the same parent pair.`,
      };
    case 'breakthrough':
      return {
        tag: 'breakthrough',
        summary: `Adds the single highest-leverage extension to ${previousTitle}.`,
        mechanism: `${source.mechanism} It is extended by the strongest available addition.`,
        claimedDelta: `Compounds the survivor instead of merely defending it.`,
      };
    case 'first-principles':
      return {
        tag: 'bedrock',
        summary: `Rebuilds ${previousTitle} from its irreducible invariants.`,
        mechanism: `${source.mechanism} It is reduced to bedrock and rebuilt from what must be true.`,
        claimedDelta: `Discards inherited framing the survivor never earned.`,
      };
    case 'polymath':
      return {
        tag: 'polymath',
        summary: `Transplants a mechanism from an adjacent domain into ${previousTitle}.`,
        mechanism: `${source.mechanism} It imports a pattern sourced from ${handle}.`,
        claimedDelta: `Crosses a domain boundary the parent pair never reached.`,
      };
    case 'addition-by-subtraction':
      return {
        tag: 'subtraction',
        summary: `Strips ${previousTitle} to its load-bearing core.`,
        mechanism: `${source.mechanism} Everything non-essential to the core is removed.`,
        claimedDelta: `Wins by removal, not accretion.`,
      };
  }
}

// One pass over one spine arrow. The stage names what unit is bred (problem-frame vs
// solution-candidate); parentNode carries the immediate parent's content (absent for the
// problem_recovery arrow, whose parent is the case_study already on the run).
export type PassContext = {
  runId: string;
  stage: GrowthStage;
  caseStudy: CaseStudy;
  parentNode?: NodeSummary;
  knowledgePacket: KnowledgePacket;
};

export type CandidateGenerationInput = PassContext & {
  generation: number;
  previousChild?: CandidateSolution;
  previousCriticVerdicts?: CriticVerdict[];
  agenomePool?: Agenome[];
};

export type CriticJudgmentInput = PassContext & {
  candidates: CandidateSolution[];
};

export type CandidateGenerator = {
  generate(input: CandidateGenerationInput): Promise<CandidateSolution[]>;
};

export type CleanBaselineGenerator = {
  generate(input: CandidateGenerationInput): Promise<CandidateSolution>;
};

export type CriticCouncil = {
  judge(input: CriticJudgmentInput): Promise<CriticVerdict[]>;
};

// The held-out judge rates one compiled survivor, fresh, on the five −5…+5 axes — it never
// sees the in-run critics, the population, or how the survivor was selected.
export type HeldOutJudgeInput = PassContext & { candidate: CandidateSolution };
export type HeldOutJudge = {
  judge(input: HeldOutJudgeInput): Promise<HeldOutJudgeResult>;
};

export type GenerationProviders = {
  cleanBaseline?: CleanBaselineGenerator;
  candidateGenerator: CandidateGenerator;
  criticCouncil: CriticCouncil;
  heldOutJudge?: HeldOutJudge;
};

function clampRating(value: number): number {
  return Math.max(-5, Math.min(5, Math.round(value)));
}

// The judge boil-down: mean of the five axis scores, clamped to −5…+5.
function judgeBoilDown(axes: ReadonlyArray<{ score: number }>): number {
  if (axes.length === 0) return 0;
  return clampRating(axes.reduce((sum, axis) => sum + axis.score, 0) / axes.length);
}

// A deterministic 1…5 axis score for the fixture judge (the real judge is a model call).
function deterministicAxisScore(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 5) + 1;
}

// The problem the arrow breeds against: the immediate parent's synopsis (the recovered
// problem, for the doppl arrow) or the seed's stated problem (for the problem_recovery arrow).
function problemContext(input: PassContext): string {
  return input.parentNode?.synopsis ?? input.caseStudy.statedProblem;
}

export type ModelGenerationPromptRenderers = {
  cleanBaseline(input: CandidateGenerationInput): string;
  candidateGeneration(input: CandidateGenerationInput): string;
  criticJudgment(input: CriticJudgmentInput): string;
  heldOutJudge(input: HeldOutJudgeInput): string;
};

function heldOutJudgeFromParsed(candidateId: string, parsed: Record<string, unknown>): HeldOutJudgeResult {
  const rawAxes = parsed.axes;
  if (!Array.isArray(rawAxes)) throw new Error('held-out judge response.axes must be an array');
  const valid = new Set<string>(JUDGE_AXES);
  const axes = rawAxes.map((entry) => {
    const record = entry as Record<string, unknown>;
    const axis = record.axis;
    if (typeof axis !== 'string' || !valid.has(axis)) {
      throw new Error(`held-out judge axis must be one of ${JUDGE_AXES.join(', ')}`);
    }
    if (typeof record.score !== 'number') throw new Error('held-out judge axis.score must be a number');
    return {
      axis: axis as JudgeAxis,
      score: clampRating(record.score),
      reasoning: typeof record.reasoning === 'string' ? record.reasoning : '',
    };
  });
  return { candidateId, axes, judge: judgeBoilDown(axes), temporal: parsed.temporal === true };
}

export type ModelGenerationProviderInput = {
  client: ModelClient;
  model: string;
  prompts?: Partial<ModelGenerationPromptRenderers>;
};

export type ModelGenerationProviders = GenerationProviders & {
  modelCallRecords: ModelCallRecord[];
  modelProvider: string;
  model: string;
};

type SeedCandidate = Omit<CandidateSolution, 'caseId' | 'generation'>;

export async function createFixtureGenerationProviders(
  fixturePath: string,
): Promise<GenerationProviders & { caseId: string }> {
  const fixture = await loadKernelFixture(fixturePath);

  function mandateFor(index: number): string {
    return fixture.critics[index % fixture.critics.length]?.revisionMandate || 'tighten the mechanism';
  }

  function scoreFor(candidate: CandidateSolution, index: number): number {
    const baseAverage = fixture.critics
      .filter((verdict) => verdict.candidateId === candidate.id)
      .reduce((sum, verdict, _, rows) => sum + verdict.score / rows.length, 0);
    if (candidate.id.startsWith('child_')) return 83;
    if (candidate.id.includes('_stability_probe_g')) return 91;
    if (candidate.id.includes('_failure_probe_g')) return 80;
    if (candidate.id.includes('_signal_probe_g')) return 67;
    if (candidate.id.startsWith('frame_')) return Number((78 - index * 6).toFixed(1));
    return Number((baseAverage || Math.max(45, 88 - index * 13)).toFixed(1));
  }

  function criticPressure(candidate: CandidateSolution, criticId: string, generation?: number): string {
    if (candidate.id.startsWith('child_')) {
      return `Carryover child keeps the prior fused mechanism alive but must beat generation ${generation ?? candidate.generation} mutations.`;
    }
    if (candidate.id.includes('_stability_probe_g')) {
      return `Mutation stress-tests whether ${candidate.title} preserves the survivor's strongest mechanism.`;
    }
    if (candidate.id.includes('_failure_probe_g')) {
      return `Failure probe applies critic pressure so the survivor cannot coast on the prior generation.`;
    }
    if (candidate.id.includes('_signal_probe_g')) {
      return `Signal probe expands the search surface, but ${criticId} still needs stronger proof.`;
    }
    if (candidate.id.startsWith('frame_')) {
      return `${criticId} presses whether ${candidate.title} recovers the real problem rather than restating the symptom.`;
    }
    return fixture.critics.find((verdict) => verdict.candidateId === candidate.id && verdict.criticId === criticId)
      ?.pressure || `${candidate.title} receives ${criticId} pressure.`;
  }

  // The problem_recovery arrow breeds problem-frames from the seed using the same mutagen
  // machinery the doppl arrow uses on solutions — one engine, no hand-authored frames.
  function problemFrameSeeds(): SeedCandidate[] {
    const seed = fixture.problemRecovery;
    const framings: ReadonlyArray<readonly [string, Mutagen]> = [
      ['root', 'first-principles'],
      ['edge', 'blindside'],
      ['reframe', 'breakout'],
    ];
    return framings.map(([tag, mutagen]) => {
      const move = mutagenMove(mutagen, { title: seed.title, mechanism: seed.hiddenConstraint }, seed.title, 'the case');
      return {
        id: `frame_${tag}`,
        agenomeId: `ag_problem_framer_${tag}`,
        title: `${seed.title} — ${move.tag}`,
        summary: `${seed.recoveredProblem} ${move.summary}`,
        mechanism: `${seed.hiddenConstraint} ${move.mechanism}`,
        claimedDelta: `${seed.falsifier} ${move.claimedDelta}`,
        citedKnowledge: [],
        mutagen,
        mutagenLineage: [mutagen],
      };
    });
  }

  function agenomeFor(input: CandidateGenerationInput, agenomeId: string): Agenome | undefined {
    return input.agenomePool?.find((agenome) => agenome.id === agenomeId);
  }

  function seedPool(input: CandidateGenerationInput): SeedCandidate[] {
    if (input.stage === 'problem_recovery') return problemFrameSeeds();
    const poolIds = new Set((input.agenomePool || []).map((agenome) => agenome.id));
    const selected = fixture.candidates.filter((candidate) => poolIds.has(candidate.agenomeId));
    return selected.length >= 2 ? selected : fixture.candidates;
  }

  function candidateWithAgenomeContext(candidate: SeedCandidate, input: CandidateGenerationInput): SeedCandidate {
    const agenome = agenomeFor(input, candidate.agenomeId);
    if (!agenome) return candidate;
    return {
      ...candidate,
      summary: `${candidate.summary} Agenome ${agenome.label} applies ${agenome.persona}.`,
      mechanism: `${candidate.mechanism} Agenome policy: ${agenome.decompositionPolicy}`,
    };
  }

  function evolveCandidates(input: CandidateGenerationInput): CandidateSolution[] {
    const pool = seedPool(input);
    if (input.generation === 0 || !input.previousChild) {
      return pool.map((candidate) =>
        assertCandidateSolution({
          ...candidateWithAgenomeContext(candidate, input),
          caseId: input.caseStudy.id,
          generation: input.generation,
        }),
      );
    }

    const [primary, secondary, tertiary] = pool;
    if (!primary || !secondary || !tertiary) {
      return pool.map((candidate) =>
        assertCandidateSolution({
          ...candidateWithAgenomeContext(candidate, input),
          caseId: input.caseStudy.id,
          generation: input.generation,
        }),
      );
    }
    const knowledge = input.knowledgePacket.items;
    const previousTitle = input.previousChild.title.replace(/\s+fusion$/i, '');
    const generation = input.generation;
    const baseLineage = input.previousChild.mutagenLineage ?? [];
    const handleAt = (offset: number): string =>
      knowledge[offset % Math.max(1, knowledge.length)]?.citeHandle ?? 'the packet';
    // The population's state picks the mutagens this generation reaches for (the tide).
    const [mutagenA, mutagenB, mutagenC] = regimeMutagens(input.previousCriticVerdicts ?? []);
    const assignments: Array<[SeedCandidate, Mutagen]> = [
      [primary, mutagenA],
      [secondary, mutagenB],
      [tertiary, mutagenC],
    ];
    const variants = assignments.map(([source, mutagen], index) => {
      const move = mutagenMove(mutagen, source, previousTitle, handleAt(index));
      return {
        mutagen,
        mutagenLineage: [...baseLineage, mutagen],
        id: `${source.id}_${move.tag}_g${generation}`,
        title: `${source.title} ${move.tag} probe`,
        summary: move.summary,
        mechanism: move.mechanism,
        claimedDelta: move.claimedDelta,
        citedKnowledge: [...new Set([...source.citedKnowledge, handleAt(index)])],
        agenomeId: `${source.agenomeId}_${move.tag}_g${generation}`,
      };
    });

    return variants.map((candidate) =>
      assertCandidateSolution({
        ...candidateWithAgenomeContext(candidate, input),
        caseId: input.caseStudy.id,
        generation,
      }),
    );
  }

  function ensureCase(caseStudy: CaseStudy): void {
    if (fixture.caseId !== caseStudy.id) {
      throw new Error(`fixture case ${fixture.caseId} does not match loaded case ${caseStudy.id}`);
    }
  }

  return {
    caseId: fixture.caseId,
    candidateGenerator: {
      async generate(input) {
        ensureCase(input.caseStudy);
        return evolveCandidates(input);
      },
    },
    cleanBaseline: {
      async generate(input) {
        ensureCase(input.caseStudy);
        const [candidate] = seedPool(input);
        if (!candidate) throw new Error('clean baseline requires at least one seed candidate');
        const contextualCandidate = candidateWithAgenomeContext(
          {
            ...candidate,
            id: `clean_${candidate.id}`,
            title: `Clean ${candidate.title}`,
            summary: `Single-pass clean-agent control: ${candidate.summary}`,
            claimedDelta: `Control answer before Doppl fusion: ${candidate.claimedDelta}`,
          },
          input,
        );
        return assertCandidateSolution({
          ...contextualCandidate,
          caseId: input.caseStudy.id,
          generation: 0,
        });
      },
    },
    criticCouncil: {
      async judge({ caseStudy, candidates }) {
        ensureCase(caseStudy);
        return candidates.flatMap((candidate, index) => {
          const total = scoreFor(candidate, index);
          return ['grounding', 'novelty', 'mechanism'].map((criticId, criticIndex) =>
            assertCriticVerdict({
              candidateId: candidate.id,
              criticId,
              score: Math.max(0, Math.min(100, Number((total - criticIndex * 2).toFixed(1)))),
              pressure: criticPressure(candidate, criticId, candidate.generation),
              revisionMandate:
                fixture.critics.find((verdict) => verdict.candidateId === candidate.id && verdict.criticId === criticId)
                  ?.revisionMandate || mandateFor(index + criticIndex),
            }),
          );
        });
      },
    },
    heldOutJudge: {
      async judge({ caseStudy, candidate }) {
        ensureCase(caseStudy);
        const axes = JUDGE_AXES.map((axis) => ({
          axis,
          score: deterministicAxisScore(`${candidate.id}:${axis}`),
          reasoning: `Held-out fixture judgment of ${candidate.title} on ${axis}.`,
        }));
        return { candidateId: candidate.id, axes, judge: judgeBoilDown(axes), temporal: false };
      },
    },
  };
}

function arrayField(value: Record<string, unknown>, field: string): unknown[] {
  const array = value[field];
  if (!Array.isArray(array)) throw new Error(`model response.${field} must be an array`);
  return array;
}

function objectField(value: Record<string, unknown>, field: string): Record<string, unknown> {
  const object = value[field];
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    throw new Error(`model response.${field} must be an object`);
  }
  return object as Record<string, unknown>;
}

function knowledgeSummary(packet: KnowledgePacket): string {
  return packet.items.map((item) => `${item.citeHandle}: ${item.text}`).join('\n');
}

function agenomeSummary(agenomes: Agenome[] = []): string {
  if (agenomes.length === 0) return 'No Agenome pool supplied.';
  return agenomes
    .map(
      (agenome) =>
        [
          `${agenome.id} (${agenome.label})`,
          `persona=${agenome.persona}`,
          `policy=${agenome.decompositionPolicy}`,
          `weights=novelty:${agenome.valueWeights.novelty},grounding:${agenome.valueWeights.grounding},feasibility:${agenome.valueWeights.feasibility},skepticism:${agenome.valueWeights.skepticism}`,
          `energy=${agenome.energy.remaining}/${agenome.energy.allocated}`,
        ].join(' | '),
    )
    .join('\n');
}

function unitFor(stage: GrowthStage): string {
  return stage === 'problem_recovery' ? 'problem-frame' : 'solution-candidate';
}

function stringSchema(): Record<string, unknown> {
  return { type: 'string' };
}

function stringArraySchema(): Record<string, unknown> {
  return { type: 'array', items: stringSchema() };
}

const candidateSchema = {
  type: 'object',
  properties: {
    id: stringSchema(),
    agenomeId: stringSchema(),
    title: stringSchema(),
    summary: stringSchema(),
    mechanism: stringSchema(),
    claimedDelta: stringSchema(),
    citedKnowledge: stringArraySchema(),
  },
  required: ['id', 'agenomeId', 'title', 'summary', 'mechanism', 'claimedDelta', 'citedKnowledge'],
  additionalProperties: false,
};

const candidateGenerationResponseSchema = {
  name: 'candidate_generation',
  schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        minItems: 2,
        items: candidateSchema,
      },
    },
    required: ['candidates'],
    additionalProperties: false,
  },
};

const cleanBaselineResponseSchema = {
  name: 'control_baseline_generation',
  schema: {
    type: 'object',
    properties: {
      candidate: candidateSchema,
    },
    required: ['candidate'],
    additionalProperties: false,
  },
};

const criticVerdictSchema = {
  type: 'object',
  properties: {
    candidateId: stringSchema(),
    criticId: stringSchema(),
    score: { type: 'number', minimum: 0, maximum: 100 },
    pressure: stringSchema(),
    revisionMandate: stringSchema(),
  },
  required: ['candidateId', 'criticId', 'score', 'pressure', 'revisionMandate'],
  additionalProperties: false,
};

const criticJudgmentResponseSchema = {
  name: 'critic_judgment',
  schema: {
    type: 'object',
    properties: {
      verdicts: {
        type: 'array',
        minItems: 1,
        items: criticVerdictSchema,
      },
    },
    required: ['verdicts'],
    additionalProperties: false,
  },
};

const heldOutJudgeResponseSchema = {
  name: 'held_out_judgment',
  schema: {
    type: 'object',
    properties: {
      axes: {
        type: 'array',
        minItems: 5,
        items: {
          type: 'object',
          properties: {
            axis: stringSchema(),
            score: { type: 'number', minimum: -5, maximum: 5 },
            reasoning: stringSchema(),
          },
          required: ['axis', 'score', 'reasoning'],
          additionalProperties: false,
        },
      },
      temporal: { type: 'boolean' },
    },
    required: ['axes', 'temporal'],
    additionalProperties: false,
  },
};

export function createDefaultModelGenerationPrompts(): ModelGenerationPromptRenderers {
  return {
    cleanBaseline(input) {
      return [
        `Return JSON only with a candidate object breeding a ${unitFor(input.stage)}.`,
        `Case: ${input.caseStudy.title}`,
        `Problem to address: ${problemContext(input)}`,
        'Create a single-pass clean-agent baseline before Doppl evolution, selection, mutation, or fusion.',
        'Agenome pool:',
        agenomeSummary(input.agenomePool),
        'The candidate omits caseId and generation; include id, agenomeId, title, summary, mechanism, claimedDelta, citedKnowledge.',
        'Do not mention Doppl as improving this answer; this is the plain control lane.',
        'Knowledge:',
        knowledgeSummary(input.knowledgePacket),
      ].join('\n');
    },
    candidateGeneration(input) {
      return [
        `Return JSON only with a candidates array breeding ${unitFor(input.stage)}s.`,
        `Case: ${input.caseStudy.title}`,
        `Generation: ${input.generation}`,
        input.stage === 'problem_recovery'
          ? `Stated problem to recover the real cause of: ${problemContext(input)}`
          : `Recovered problem to solve: ${problemContext(input)}`,
        'Agenome pool:',
        agenomeSummary(input.agenomePool),
        input.previousChild
          ? `Previous survivor: ${input.previousChild.id} / ${input.previousChild.title} / ${input.previousChild.summary}`
          : 'Previous survivor: none; create the initial population.',
        input.previousCriticVerdicts?.length
          ? `Prior critic mandates: ${input.previousCriticVerdicts.map((verdict) => `${verdict.candidateId}:${verdict.revisionMandate}`).join(' | ')}`
          : 'Prior critic mandates: none.',
        'Each candidate omits caseId and generation; include id, agenomeId, title, summary, mechanism, claimedDelta, citedKnowledge.',
        'Choose agenomeId from the supplied Agenome pool and make the candidate reflect that Agenome persona, policy, and value weights.',
        'For generation > 0, do not repeat prior candidate IDs or simply rename them. Generate mutations, probes, or recombinations that respond to the previous survivor and critic mandates.',
        'Knowledge:',
        knowledgeSummary(input.knowledgePacket),
      ].join('\n');
    },
    criticJudgment(input) {
      return [
        'Return JSON only with a verdicts array.',
        `Case: ${input.caseStudy.title}`,
        `Problem under judgment: ${problemContext(input)}`,
        `Candidates: ${input.candidates.map((candidate) => candidate.id).join(', ')}`,
        'Each verdict must include candidateId, criticId, score, pressure, revisionMandate.',
      ].join('\n');
    },
    heldOutJudge(input) {
      return [
        'You are a held-out judge. You did NOT see how this idea was generated, selected, or critiqued.',
        `Rate this ${input.stage === 'problem_recovery' ? 'recovered problem' : 'solution'} on five axes — each an integer from -5 to +5 — with one sentence of reasoning each.`,
        `Use these exact axis names: ${JUDGE_AXES.join(', ')}.`,
        `Case: ${input.caseStudy.title}`,
        `Problem context: ${problemContext(input)}`,
        `Title: ${input.candidate.title}`,
        `Summary: ${input.candidate.summary}`,
        `Mechanism: ${input.candidate.mechanism}`,
        `Claimed delta: ${input.candidate.claimedDelta}`,
        'Return JSON only: {"axes":[{"axis":"Novelty","score":n,"reasoning":"..."}, ...five total...], "temporal": true|false}.',
      ].join('\n');
    },
  };
}

export function createModelGenerationProviders(input: ModelGenerationProviderInput): ModelGenerationProviders {
  const prompts = { ...createDefaultModelGenerationPrompts(), ...input.prompts };
  const modelCallRecords: ModelCallRecord[] = [];

  async function complete(request: Parameters<ModelClient['complete']>[0]): Promise<ModelCallRecord> {
    const response = await input.client.complete(request);
    modelCallRecords.push(response);
    return response;
  }

  async function parseWithRepair<T>(
    request: Parameters<ModelClient['complete']>[0],
    validate: (parsed: Record<string, unknown>) => T,
  ): Promise<T> {
    const response = await complete(request);
    try {
      return validate(parseJsonObjectResponse(response.outputText));
    } catch (error) {
      response.metadata = {
        ...response.metadata,
        status: 'repair_requested',
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const repairResponse = await complete({
      ...request,
      purpose: `${request.purpose}.repair`,
      prompt: [
        request.prompt,
        '',
        'Repair the previous output into valid JSON only.',
        'Previous output:',
        response.outputText,
      ].join('\n'),
    });
    try {
      const repaired = validate(parseJsonObjectResponse(repairResponse.outputText));
      repairResponse.metadata = { ...repairResponse.metadata, status: 'repaired' };
      return repaired;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      repairResponse.metadata = {
        ...repairResponse.metadata,
        status: 'rejected',
        error: message,
      };
      throw new Error(`model output rejected after repair: ${message}`, { cause: error });
    }
  }

  return {
    modelCallRecords,
    modelProvider: 'model_generation_provider',
    model: input.model,
    cleanBaseline: {
      async generate(providerInput) {
        return parseWithRepair(
          {
            runId: providerInput.runId,
            purpose: 'control_baseline_generation',
            prompt: prompts.cleanBaseline(providerInput),
            model: input.model,
            responseFormat: 'json_object',
            responseSchema: cleanBaselineResponseSchema,
          },
          (parsed) =>
            assertCandidateSolution({
              ...objectField(parsed, 'candidate'),
              caseId: providerInput.caseStudy.id,
              generation: 0,
            }),
        );
      },
    },
    candidateGenerator: {
      async generate(providerInput) {
        return parseWithRepair(
          {
            runId: providerInput.runId,
            purpose: 'candidate_generation',
            prompt: prompts.candidateGeneration(providerInput),
            model: input.model,
            responseFormat: 'json_object',
            responseSchema: candidateGenerationResponseSchema,
          },
          (parsed) =>
            arrayField(parsed, 'candidates').map((candidate) =>
              assertCandidateSolution({
                ...(candidate as Record<string, unknown>),
                caseId: providerInput.caseStudy.id,
                generation: providerInput.generation,
              }),
            ),
        );
      },
    },
    criticCouncil: {
      async judge(providerInput) {
        return parseWithRepair(
          {
            runId: providerInput.runId,
            purpose: 'critic_judgment',
            prompt: prompts.criticJudgment(providerInput),
            model: input.model,
            responseFormat: 'json_object',
            responseSchema: criticJudgmentResponseSchema,
          },
          (parsed) => arrayField(parsed, 'verdicts').map(assertCriticVerdict),
        );
      },
    },
    heldOutJudge: {
      async judge(providerInput) {
        return parseWithRepair(
          {
            runId: providerInput.runId,
            purpose: 'held_out_judgment',
            prompt: prompts.heldOutJudge(providerInput),
            model: input.model,
            responseFormat: 'json_object',
            responseSchema: heldOutJudgeResponseSchema,
          },
          (parsed) => heldOutJudgeFromParsed(providerInput.candidate.id, parsed),
        );
      },
    },
  };
}
