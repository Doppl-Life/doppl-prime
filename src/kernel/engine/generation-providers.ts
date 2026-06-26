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

// The move each mutagen instructs the model to make this generation. The tide
// (regimeMutagens) picks which three the population reaches for; these briefs go into
// the live generation prompt so the model applies them to the survivor.
const MUTAGEN_BRIEF: Record<Mutagen, string> = {
  'constraint-injection': 'add the one productive constraint that forces the survivor to prove its strongest mechanism under tighter pressure',
  blindside: 'turn the prior critic mandate into a falsifier and attack the survivor through its weakest assumption',
  breakout: 'escape the frame around the survivor toward a different signal; broaden the search instead of defending the parent',
  breakthrough: 'add the single highest-leverage extension to the survivor so it compounds rather than merely holds',
  'first-principles': 'reduce the survivor to its irreducible invariants and rebuild from what must be true, discarding inherited framing',
  polymath: 'transplant a mechanism from an adjacent domain to cross a boundary the parent pair never reached',
  'addition-by-subtraction': 'strip the survivor to its load-bearing core; win by removal, not accretion',
};

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
  // Optional shared record sink, so a cascade of providers writes into one trace.
  records?: ModelCallRecord[];
};

export type ModelGenerationProviders = GenerationProviders & {
  modelCallRecords: ModelCallRecord[];
  modelProvider: string;
  model: string;
};

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

const ALL_MUTAGENS = Object.keys(MUTAGEN_BRIEF) as Mutagen[];
const MUTAGEN_SET: ReadonlySet<string> = new Set(ALL_MUTAGENS);

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
    // Optional: the mutagen the model applied to mutate the survivor (generation > 0). Tagged by
    // the model from the tide set named in the prompt; the engine validates and accumulates lineage.
    mutagen: { type: 'string', enum: ALL_MUTAGENS },
  },
  required: ['id', 'agenomeId', 'title', 'summary', 'mechanism', 'claimedDelta', 'citedKnowledge'],
  additionalProperties: false,
};

// Keep only a model-declared mutagen the engine recognizes, and accumulate the survivor's lineage.
// Generation 0 candidates are seeds (no mutagen). A missing or unknown tag is dropped, never faked.
function withMutagenLineage(
  candidate: CandidateSolution,
  input: CandidateGenerationInput,
): CandidateSolution {
  if (input.generation === 0) return candidate;
  const declared = candidate.mutagen;
  if (declared === undefined || !MUTAGEN_SET.has(declared)) {
    const { mutagen: _dropped, ...rest } = candidate;
    return rest;
  }
  return {
    ...candidate,
    mutagen: declared,
    mutagenLineage: [...(input.previousChild?.mutagenLineage ?? []), declared],
  };
}

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
  // pressure and revisionMandate are requested but not required — the score is load-bearing, the
  // prose is explanatory, so a fast/small model that returns score-only still validates.
  required: ['candidateId', 'criticId', 'score'],
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
        input.generation > 0
          ? `The population's state calls for these moves this generation (the tide) — reach for them: ${regimeMutagens(
              input.previousCriticVerdicts ?? [],
            )
              .map((mutagen) => `${mutagen} — ${MUTAGEN_BRIEF[mutagen]}`)
              .join(
                '; ',
              )}. Set each candidate's "mutagen" field to the one move it applied (exactly one of those names).`
          : 'Initial population: spread across distinct framings; do not converge yet.',
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
  const modelCallRecords = input.records ?? [];

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
              withMutagenLineage(
                assertCandidateSolution({
                  ...(candidate as Record<string, unknown>),
                  caseId: providerInput.caseStudy.id,
                  generation: providerInput.generation,
                }),
                providerInput,
              ),
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

// A quality-aware provider cascade: try each layer's generation/judgment, falling through to the
// next when a layer throws — including when a model's output fails validation even after repair (a
// weak model omitting required fields). So a fast model can lead and a reliable model can be the
// floor, per call. Layers should share one record sink (pass the same `records` array to each
// createModelGenerationProviders) so the trace stays whole; this exposes that shared sink.
export function createFallbackGenerationProviders(
  layers: readonly ModelGenerationProviders[],
  records: ModelCallRecord[],
): ModelGenerationProviders {
  const [first] = layers;
  if (!first) throw new Error('createFallbackGenerationProviders requires at least one layer');
  async function viaLayers<T>(what: string, call: (layer: ModelGenerationProviders) => Promise<T>): Promise<T> {
    const failures: string[] = [];
    for (const layer of layers) {
      try {
        return await call(layer);
      } catch (error) {
        failures.push(`${layer.model}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`all generation layers failed for ${what} — ${failures.join(' | ')}`);
  }
  return {
    modelCallRecords: records,
    modelProvider: 'cascade',
    model: first.model,
    cleanBaseline: {
      generate: (input) => viaLayers('control_baseline', (layer) => {
        const baseline = layer.cleanBaseline;
        if (!baseline) throw new Error('layer has no clean baseline');
        return baseline.generate(input);
      }),
    },
    candidateGenerator: {
      generate: (input) => viaLayers('candidate_generation', (layer) => layer.candidateGenerator.generate(input)),
    },
    criticCouncil: {
      judge: (input) => viaLayers('critic_judgment', (layer) => layer.criticCouncil.judge(input)),
    },
    heldOutJudge: {
      judge: (input) => viaLayers('held_out_judgment', (layer) => {
        const judge = layer.heldOutJudge;
        if (!judge) throw new Error('layer has no held-out judge');
        return judge.judge(input);
      }),
    },
  };
}
