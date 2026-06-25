import {
  assertCandidateSolution,
  assertCriticVerdict,
  assertProblemRecovery,
  type Agenome,
  type CandidateSolution,
  type CaseStudy,
  type CriticVerdict,
  type KnowledgePacket,
  type Mutagen,
  type ProblemRecovery,
} from './contracts.ts';
import { loadKernelFixture } from './fixtures.ts';
import { parseJsonObjectResponse, type ModelCallRecord, type ModelClient } from './model-gateway.ts';

export type ProblemRecoveryInput = {
  runId: string;
  caseStudy: CaseStudy;
  knowledgePacket: KnowledgePacket;
};

export type CandidateGenerationInput = {
  runId: string;
  caseStudy: CaseStudy;
  problemRecovery: ProblemRecovery;
  knowledgePacket: KnowledgePacket;
  generation: number;
  previousChild?: CandidateSolution;
  previousCriticVerdicts?: CriticVerdict[];
  agenomePool?: Agenome[];
};

export type CriticJudgmentInput = {
  runId: string;
  caseStudy: CaseStudy;
  problemRecovery: ProblemRecovery;
  candidates: CandidateSolution[];
  knowledgePacket: KnowledgePacket;
};

export type ProblemRecoveryProvider = {
  recover(input: ProblemRecoveryInput): Promise<ProblemRecovery>;
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

export type GenerationProviders = {
  problemRecovery: ProblemRecoveryProvider;
  cleanBaseline?: CleanBaselineGenerator;
  candidateGenerator: CandidateGenerator;
  criticCouncil: CriticCouncil;
};

export type ModelGenerationPromptRenderers = {
  problemRecovery(input: ProblemRecoveryInput): string;
  cleanBaseline(input: CandidateGenerationInput): string;
  candidateGeneration(input: CandidateGenerationInput): string;
  criticJudgment(input: CriticJudgmentInput): string;
};

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
    return fixture.critics.find((verdict) => verdict.candidateId === candidate.id && verdict.criticId === criticId)
      ?.pressure || `${candidate.title} receives ${criticId} pressure.`;
  }

  function agenomeFor(input: CandidateGenerationInput, agenomeId: string): Agenome | undefined {
    return input.agenomePool?.find((agenome) => agenome.id === agenomeId);
  }

  function fixtureCandidatesFor(input: CandidateGenerationInput): Array<typeof fixture.candidates[number]> {
    const poolIds = new Set((input.agenomePool || []).map((agenome) => agenome.id));
    const selected = fixture.candidates.filter((candidate) => poolIds.has(candidate.agenomeId));
    return selected.length >= 2 ? selected : fixture.candidates;
  }

  function candidateWithAgenomeContext(
    candidate: Omit<CandidateSolution, 'caseId' | 'generation'>,
    input: CandidateGenerationInput,
  ): Omit<CandidateSolution, 'caseId' | 'generation'> {
    const agenome = agenomeFor(input, candidate.agenomeId);
    if (!agenome) return candidate;
    return {
      ...candidate,
      summary: `${candidate.summary} Agenome ${agenome.label} applies ${agenome.persona}.`,
      mechanism: `${candidate.mechanism} Agenome policy: ${agenome.decompositionPolicy}`,
    };
  }

  function evolveCandidates(input: CandidateGenerationInput): CandidateSolution[] {
    const fixtureCandidates = fixtureCandidatesFor(input);
    if (input.generation === 0 || !input.previousChild) {
      return fixtureCandidates.map((candidate) => {
        const contextualCandidate = candidateWithAgenomeContext(candidate, input);
        return assertCandidateSolution({
          ...contextualCandidate,
          caseId: input.caseStudy.id,
          generation: input.generation,
        });
      });
    }

    const [primary, secondary, tertiary] = fixtureCandidates;
    if (!primary || !secondary || !tertiary) {
      // Fewer than three candidates to mutate; fall back to a straight contextual pass.
      return fixtureCandidates.map((candidate) =>
        assertCandidateSolution({
          ...candidateWithAgenomeContext(candidate, input),
          caseId: input.caseStudy.id,
          generation: input.generation,
        }),
      );
    }
    const knowledge = input.knowledgePacket.items;
    const childTitle = input.previousChild.title.replace(/\s+fusion$/i, '');
    const generation = input.generation;
    const definedHandle = (handle: string | undefined): handle is string => handle !== undefined;
    const baseLineage = input.previousChild.mutagenLineage ?? [];
    const stabilityMutagen: Mutagen = 'constraint-injection';
    const failureMutagen: Mutagen = 'blindside';
    const signalMutagen: Mutagen = 'breakout';
    const variants = [
      {
        source: primary,
        mutagen: stabilityMutagen,
        mutagenLineage: [...baseLineage, stabilityMutagen],
        id: `${primary.id}_stability_probe_g${generation}`,
        title: `${primary.title} Stability Probe`,
        summary: `Mutates the previous survivor into a stricter ${primary.title} test for generation ${generation}.`,
        mechanism: `${input.previousChild.mechanism} It must now satisfy this mandate: ${mandateFor(0)}.`,
        claimedDelta: `Keeps ${childTitle} only if the strongest inherited mechanism survives new pressure.`,
        citedKnowledge: [...new Set([...input.previousChild.citedKnowledge, ...primary.citedKnowledge])],
        agenomeId: `${primary.agenomeId}_mutation_g${generation}`,
      },
      {
        source: secondary,
        mutagen: failureMutagen,
        mutagenLineage: [...baseLineage, failureMutagen],
        id: `${secondary.id}_failure_probe_g${generation}`,
        title: `${secondary.title} Failure Probe`,
        summary: `Turns the prior critic mandate into a falsifier against ${input.previousChild.title}.`,
        mechanism: `${secondary.mechanism} It attacks the survivor through: ${mandateFor(3)}.`,
        claimedDelta: `Adds a failure mode instead of re-running ${secondary.title}.`,
        citedKnowledge: [...new Set([...secondary.citedKnowledge, knowledge[0]?.citeHandle].filter(definedHandle))],
        agenomeId: `${secondary.agenomeId}_critic_probe_g${generation}`,
      },
      {
        source: tertiary,
        mutagen: signalMutagen,
        mutagenLineage: [...baseLineage, signalMutagen],
        id: `${tertiary.id}_signal_probe_g${generation}`,
        title: `${tertiary.title} Signal Probe`,
        summary: `Explores a new observable signal adjacent to ${input.previousChild.title}.`,
        mechanism: `${tertiary.mechanism} It is redirected toward evidence from ${knowledge[generation % knowledge.length]?.citeHandle || 'the packet'}.`,
        claimedDelta: `Broadens the search without letting the population collapse to the same parent pair.`,
        citedKnowledge: [...new Set([...tertiary.citedKnowledge, knowledge[generation % knowledge.length]?.citeHandle].filter(definedHandle))],
        agenomeId: `${tertiary.agenomeId}_signal_probe_g${generation}`,
      },
    ];

    return variants.map(({ source: _source, ...candidate }) =>
      assertCandidateSolution({
        ...candidateWithAgenomeContext(candidate, input),
        caseId: input.caseStudy.id,
        generation,
      }),
    );
  }

  return {
    caseId: fixture.caseId,
    problemRecovery: {
      async recover({ caseStudy, knowledgePacket }) {
        if (fixture.caseId !== caseStudy.id) {
          throw new Error(`fixture case ${fixture.caseId} does not match loaded case ${caseStudy.id}`);
        }
        return assertProblemRecovery({
          id: `recovery_${caseStudy.id}`,
          caseId: caseStudy.id,
          ...fixture.problemRecovery,
          citedKnowledge: knowledgePacket.items.map((item) => item.citeHandle),
        });
      },
    },
    candidateGenerator: {
      async generate(input) {
        const { caseStudy } = input;
        if (fixture.caseId !== caseStudy.id) {
          throw new Error(`fixture case ${fixture.caseId} does not match loaded case ${caseStudy.id}`);
        }
        return evolveCandidates(input);
      },
    },
    cleanBaseline: {
      async generate(input) {
        const { caseStudy } = input;
        if (fixture.caseId !== caseStudy.id) {
          throw new Error(`fixture case ${fixture.caseId} does not match loaded case ${caseStudy.id}`);
        }
        const [candidate] = fixtureCandidatesFor(input);
        if (!candidate) {
          throw new Error('clean baseline requires at least one fixture candidate');
        }
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
          caseId: caseStudy.id,
          generation: 0,
        });
      },
    },
    criticCouncil: {
      async judge({ caseStudy, candidates }) {
        if (fixture.caseId !== caseStudy.id) {
          throw new Error(`fixture case ${fixture.caseId} does not match loaded case ${caseStudy.id}`);
        }
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

function stringSchema(): Record<string, unknown> {
  return { type: 'string' };
}

function stringArraySchema(): Record<string, unknown> {
  return { type: 'array', items: stringSchema() };
}

const problemRecoveryResponseSchema = {
  name: 'problem_recovery',
  schema: {
    type: 'object',
    properties: {
      title: stringSchema(),
      recoveredProblem: stringSchema(),
      hiddenConstraint: stringSchema(),
      falsifier: stringSchema(),
    },
    required: ['title', 'recoveredProblem', 'hiddenConstraint', 'falsifier'],
    additionalProperties: false,
  },
};

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

export function createDefaultModelGenerationPrompts(): ModelGenerationPromptRenderers {
  return {
    problemRecovery({ caseStudy, knowledgePacket }) {
      return [
        'Return JSON only for a ProblemRecovery without id, caseId, or citedKnowledge.',
        `Case: ${caseStudy.title}`,
        `Stated problem: ${caseStudy.statedProblem}`,
        'Knowledge:',
        knowledgeSummary(knowledgePacket),
      ].join('\n');
    },
    cleanBaseline({ caseStudy, problemRecovery, knowledgePacket, agenomePool }) {
      return [
        'Return JSON only with a candidate object.',
        `Case: ${caseStudy.title}`,
        `Recovered problem: ${problemRecovery.recoveredProblem}`,
        'Create a single-pass clean-agent baseline before Doppl evolution, selection, mutation, or fusion.',
        'Agenome pool:',
        agenomeSummary(agenomePool),
        'The candidate omits caseId and generation; include id, agenomeId, title, summary, mechanism, claimedDelta, citedKnowledge.',
        'Use agenomeId ag_clean_control unless a supplied Agenome clearly fits better.',
        'Do not mention Doppl as improving this answer; this is the plain control lane.',
        'Knowledge:',
        knowledgeSummary(knowledgePacket),
      ].join('\n');
    },
    candidateGeneration({ caseStudy, problemRecovery, knowledgePacket, generation, previousChild, previousCriticVerdicts, agenomePool }) {
      return [
        'Return JSON only with a candidates array.',
        `Case: ${caseStudy.title}`,
        `Generation: ${generation}`,
        `Recovered problem: ${problemRecovery.recoveredProblem}`,
        'Agenome pool:',
        agenomeSummary(agenomePool),
        previousChild
          ? `Previous survivor: ${previousChild.id} / ${previousChild.title} / ${previousChild.summary}`
          : 'Previous survivor: none; create the initial population.',
        previousCriticVerdicts?.length
          ? `Prior critic mandates: ${previousCriticVerdicts.map((verdict) => `${verdict.candidateId}:${verdict.revisionMandate}`).join(' | ')}`
          : 'Prior critic mandates: none.',
        'Each candidate omits caseId and generation; include id, agenomeId, title, summary, mechanism, claimedDelta, citedKnowledge.',
        'Choose agenomeId from the supplied Agenome pool and make the candidate reflect that Agenome persona, policy, and value weights.',
        'For generation > 0, do not repeat prior candidate IDs or simply rename them. Generate mutations, probes, or recombinations that respond to the previous survivor and critic mandates.',
        'Knowledge:',
        knowledgeSummary(knowledgePacket),
      ].join('\n');
    },
    criticJudgment({ caseStudy, problemRecovery, candidates }) {
      return [
        'Return JSON only with a verdicts array.',
        `Case: ${caseStudy.title}`,
        `Recovered problem: ${problemRecovery.recoveredProblem}`,
        `Candidates: ${candidates.map((candidate) => candidate.id).join(', ')}`,
        'Each verdict must include candidateId, criticId, score, pressure, revisionMandate.',
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
    problemRecovery: {
      async recover(providerInput) {
        return parseWithRepair(
          {
            runId: providerInput.runId,
            purpose: 'problem_recovery',
            prompt: prompts.problemRecovery(providerInput),
            model: input.model,
            responseFormat: 'json_object',
            responseSchema: problemRecoveryResponseSchema,
          },
          (parsed) =>
            assertProblemRecovery({
              id: `recovery_${providerInput.caseStudy.id}`,
              caseId: providerInput.caseStudy.id,
              ...parsed,
              citedKnowledge: providerInput.knowledgePacket.items.map((item) => item.citeHandle),
            }),
        );
      },
    },
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
  };
}
