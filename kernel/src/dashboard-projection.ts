import type { DashboardEnvelope } from './dashboard-envelope.ts';
import { toDashboardEnvelope } from './dashboard-envelope.ts';
import type { RunEvent } from './contracts.ts';

type RunIndexCandidate = {
  id: string;
  agenomeId: string;
  generation: number;
  title: string;
  summary: string;
  mechanism: string;
  claimedDelta: string;
  citedKnowledge: string[];
  mutagen?: string;
  mutagenLineage?: string[];
};

type RunIndexAgenome = {
  id: string;
  label?: string;
  prompt?: string;
  persona?: string;
  valueWeights?: Record<string, number>;
  toolPermissions?: string[];
  decompositionPolicy?: string;
  spawnBudget?: { maxCandidates?: number };
  parentAgenomeIds?: string[];
  mutations?: string[];
  generations?: number[];
};

type RunIndexFitness = {
  candidateId: string;
  total: number;
  components: Record<string, number>;
  rationale: string;
};

type RunIndexCriticVerdict = {
  candidateId: string;
  criticId: string;
  score: number;
  pressure: string;
  revisionMandate: string;
};

type RunIndexEnergyEntry = {
  id: string;
  agenomeId: string;
  generation: number;
  kind: 'allocation' | 'spend';
  units: number;
  reason: string;
  candidateId?: string;
};

type RunIndexEvolution = {
  generation: number;
  candidateIds: string[];
  childId?: string;
};

type RunIndexFusionChild = {
  generation: number;
  child: RunIndexCandidate;
  parentCandidateIds: [string, string];
  mutationNotes?: string[];
};

type RunIndex = {
  runId: string;
  caseId: string;
  caseTitle?: string;
  problemRecovery?: {
    recoveredProblem?: string;
    title?: string;
  };
  candidates?: RunIndexCandidate[];
  child?: RunIndexCandidate & {
    parentCandidateIds?: [string, string];
    mutationNotes?: string[];
  } | null;
  fusionChildren?: RunIndexFusionChild[];
  agenomes?: RunIndexAgenome[];
  fitnessRecords?: RunIndexFitness[];
  criticVerdicts?: RunIndexCriticVerdict[];
  energyLedger?: RunIndexEnergyEntry[];
  evolution?: RunIndexEvolution[];
  budget?: {
    maxUnits?: number;
    usedUnits?: number;
  };
};

type EventDraft = Omit<DashboardEnvelope, 'id' | 'sequence' | 'schemaVersion'>;

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === 'string' && field.length > 0 ? field : undefined;
}

function numberField(value: Record<string, unknown>, key: string): number | undefined {
  const field = value[key];
  return typeof field === 'number' && Number.isFinite(field) ? field : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function numberRecord(value: unknown): Record<string, number> | undefined {
  const record = objectRecord(value);
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
}

function candidateFromRecord(value: unknown): RunIndexCandidate | undefined {
  const record = objectRecord(value);
  if (!record) return undefined;
  const id = stringField(record, 'id');
  const agenomeId = stringField(record, 'agenomeId');
  const generation = numberField(record, 'generation');
  const title = stringField(record, 'title');
  const summary = stringField(record, 'summary');
  const mechanism = stringField(record, 'mechanism');
  const claimedDelta = stringField(record, 'claimedDelta');
  if (
    !id ||
    !agenomeId ||
    generation === undefined ||
    !title ||
    !summary ||
    !mechanism ||
    !claimedDelta
  ) {
    return undefined;
  }
  return {
    id,
    agenomeId,
    generation,
    title,
    summary,
    mechanism,
    claimedDelta,
    citedKnowledge: stringArray(record.citedKnowledge),
    ...(stringField(record, 'mutagen') ? { mutagen: stringField(record, 'mutagen') } : {}),
    ...(stringArray(record.mutagenLineage).length
      ? { mutagenLineage: stringArray(record.mutagenLineage) }
      : {}),
  };
}

function runIndexFromRecord(value: Record<string, unknown>): RunIndex | undefined {
  const runId = stringField(value, 'runId');
  const caseId = stringField(value, 'caseId');
  if (!runId || !caseId) return undefined;
  const childRecord = objectRecord(value.child);
  const child = childRecord ? candidateFromRecord(childRecord) : undefined;
  return {
    runId,
    caseId,
    ...(stringField(value, 'caseTitle') ? { caseTitle: stringField(value, 'caseTitle') } : {}),
    ...(objectRecord(value.problemRecovery)
      ? { problemRecovery: objectRecord(value.problemRecovery) as RunIndex['problemRecovery'] }
      : {}),
    candidates: Array.isArray(value.candidates)
      ? value.candidates.map(candidateFromRecord).filter((candidate): candidate is RunIndexCandidate => Boolean(candidate))
      : [],
    child: child
      ? {
          ...child,
          parentCandidateIds: Array.isArray(childRecord?.parentCandidateIds)
            ? (childRecord.parentCandidateIds.slice(0, 2).filter((id): id is string => typeof id === 'string') as [
                string,
                string,
              ])
            : undefined,
          mutationNotes: stringArray(childRecord?.mutationNotes),
        }
      : null,
    fusionChildren: Array.isArray(value.fusionChildren)
      ? value.fusionChildren.flatMap((entry) => {
          const record = objectRecord(entry);
          const childCandidate = candidateFromRecord(record?.child);
          if (!record || !childCandidate) return [];
          const parentCandidateIds = stringArray(record.parentCandidateIds).slice(0, 2);
          if (parentCandidateIds.length !== 2) return [];
          return [
            {
              generation: numberField(record, 'generation') ?? Math.max(0, childCandidate.generation - 1),
              child: childCandidate,
              parentCandidateIds: parentCandidateIds as [string, string],
              mutationNotes: stringArray(record.mutationNotes),
            },
          ];
        })
      : [],
    agenomes: Array.isArray(value.agenomes) ? value.agenomes.flatMap(agenomeFromRecord) : [],
    fitnessRecords: Array.isArray(value.fitnessRecords) ? value.fitnessRecords.flatMap(fitnessFromRecord) : [],
    criticVerdicts: Array.isArray(value.criticVerdicts) ? value.criticVerdicts.flatMap(criticFromRecord) : [],
    energyLedger: Array.isArray(value.energyLedger) ? value.energyLedger.flatMap(energyFromRecord) : [],
    evolution: Array.isArray(value.evolution) ? value.evolution.flatMap(evolutionFromRecord) : [],
    ...(objectRecord(value.budget) ? { budget: objectRecord(value.budget) as RunIndex['budget'] } : {}),
  };
}

function agenomeFromRecord(value: unknown): RunIndexAgenome[] {
  const record = objectRecord(value);
  const id = record ? stringField(record, 'id') : undefined;
  if (!record || !id) return [];
  const spawnBudget = objectRecord(record.spawnBudget);
  return [
    {
      id,
      ...(stringField(record, 'label') ? { label: stringField(record, 'label') } : {}),
      ...(stringField(record, 'prompt') ? { prompt: stringField(record, 'prompt') } : {}),
      ...(stringField(record, 'persona') ? { persona: stringField(record, 'persona') } : {}),
      ...(numberRecord(record.valueWeights) ? { valueWeights: numberRecord(record.valueWeights) } : {}),
      toolPermissions: stringArray(record.toolPermissions),
      ...(stringField(record, 'decompositionPolicy')
        ? { decompositionPolicy: stringField(record, 'decompositionPolicy') }
        : {}),
      ...(spawnBudget ? { spawnBudget: { maxCandidates: numberField(spawnBudget, 'maxCandidates') } } : {}),
      parentAgenomeIds: stringArray(record.parentAgenomeIds),
      mutations: stringArray(record.mutations),
      generations: Array.isArray(record.generations)
        ? record.generations.filter((generation): generation is number => typeof generation === 'number')
        : [],
    },
  ];
}

function fitnessFromRecord(value: unknown): RunIndexFitness[] {
  const record = objectRecord(value);
  const candidateId = record ? stringField(record, 'candidateId') : undefined;
  const total = record ? numberField(record, 'total') : undefined;
  const components = record ? numberRecord(record.components) : undefined;
  const rationale = record ? stringField(record, 'rationale') : undefined;
  if (!candidateId || total === undefined || !components || !rationale) return [];
  return [{ candidateId, total, components, rationale }];
}

function criticFromRecord(value: unknown): RunIndexCriticVerdict[] {
  const record = objectRecord(value);
  const candidateId = record ? stringField(record, 'candidateId') : undefined;
  const criticId = record ? stringField(record, 'criticId') : undefined;
  const score = record ? numberField(record, 'score') : undefined;
  const pressure = record ? stringField(record, 'pressure') : undefined;
  const revisionMandate = record ? stringField(record, 'revisionMandate') : undefined;
  if (!candidateId || !criticId || score === undefined || !pressure || !revisionMandate) return [];
  return [{ candidateId, criticId, score, pressure, revisionMandate }];
}

function energyFromRecord(value: unknown): RunIndexEnergyEntry[] {
  const record = objectRecord(value);
  const id = record ? stringField(record, 'id') : undefined;
  const agenomeId = record ? stringField(record, 'agenomeId') : undefined;
  const generation = record ? numberField(record, 'generation') : undefined;
  const units = record ? numberField(record, 'units') : undefined;
  const reason = record ? stringField(record, 'reason') : undefined;
  const kind = record?.kind === 'allocation' || record?.kind === 'spend' ? record.kind : undefined;
  if (!record || !id || !agenomeId || generation === undefined || units === undefined || !reason || !kind) {
    return [];
  }
  const candidateId = stringField(record, 'candidateId');
  return [
    {
      id,
      agenomeId,
      generation,
      units,
      reason,
      kind,
      ...(candidateId ? { candidateId } : {}),
    },
  ];
}

function evolutionFromRecord(value: unknown): RunIndexEvolution[] {
  const record = objectRecord(value);
  const generation = record ? numberField(record, 'generation') : undefined;
  if (!record || generation === undefined) return [];
  return [
    {
      generation,
      candidateIds: stringArray(record.candidateIds),
      ...(stringField(record, 'childId') ? { childId: stringField(record, 'childId') } : {}),
    },
  ];
}

function latestOccurredAt(events: RunEvent[], type: RunEvent['type']): string | undefined {
  return events.find((event) => event.type === type)?.occurredAt;
}

function generationId(index: number): string {
  return `gen_${index}`;
}

function subtypeFor(candidate: RunIndexCandidate): 'cross_domain_transfer' | 'zeitgeist_synthesis' {
  const lineage = candidate.mutagenLineage ?? (candidate.mutagen ? [candidate.mutagen] : []);
  return lineage.includes('polymath') ? 'cross_domain_transfer' : 'zeitgeist_synthesis';
}

function candidatePayload(candidate: RunIndexCandidate, run: RunIndex) {
  const subtype = subtypeFor(candidate);
  const evidenceRefs = candidate.citedKnowledge.map((cite) => ({
    kind: 'trace',
    label: cite,
  }));
  return {
    id: candidate.id,
    runId: run.runId,
    generationId: generationId(candidate.generation),
    agenomeId: candidate.agenomeId,
    title: candidate.title,
    summary: candidate.summary,
    explanation: candidate.mechanism,
    claims: [candidate.claimedDelta],
    evidenceRefs,
    status: 'created',
    subtype,
    subtypePayload:
      subtype === 'cross_domain_transfer'
        ? {
            sourceDomain: 'prior case',
            sourceTechnique: candidate.summary,
            targetDomain: run.caseTitle ?? run.caseId,
            targetProblem: run.problemRecovery?.recoveredProblem ?? run.caseId,
            transferMapping: candidate.mechanism,
            expectedMechanism: candidate.claimedDelta,
          }
        : {
            thesis: candidate.claimedDelta,
            audience: run.caseTitle ?? run.caseId,
            currentSignals: candidate.citedKnowledge,
            whyNow: candidate.mechanism,
            falsifiablePredictions: [candidate.claimedDelta],
            comparablePriorArt: candidate.citedKnowledge,
          },
  };
}

function criticMandate(criticId: string): string {
  if (criticId.includes('novel')) return 'novelty_prior_art';
  if (criticId.includes('ground')) return 'factual_grounding';
  if (criticId.includes('fals')) return 'falsification';
  return 'feasibility';
}

function draft(
  run: RunIndex,
  rawEvents: RunEvent[],
  type: string,
  actor: string,
  payload: unknown,
  options: {
    occurredAt?: string;
    generation?: number;
    agenomeId?: string;
    candidateId?: string;
  } = {},
): EventDraft {
  return {
    type,
    actor,
    occurredAt: options.occurredAt ?? rawEvents[0]?.occurredAt ?? new Date(0).toISOString(),
    runId: run.runId,
    ...(options.generation !== undefined ? { generationId: generationId(options.generation) } : {}),
    ...(options.agenomeId !== undefined ? { agenomeId: options.agenomeId } : {}),
    ...(options.candidateId !== undefined ? { candidateId: options.candidateId } : {}),
    payload,
  };
}

function materialize(drafts: EventDraft[]): DashboardEnvelope[] {
  return drafts.map((event, sequence) => ({
    ...event,
    id: `dashboard_evt_${sequence}`,
    sequence,
    schemaVersion: 1,
  }));
}

export function projectRunIndexToDashboardEvents(
  value: Record<string, unknown>,
  rawEvents: RunEvent[],
): DashboardEnvelope[] {
  const run = runIndexFromRecord(value);
  if (!run) return rawEvents.map(toDashboardEnvelope);
  const startedAt = latestOccurredAt(rawEvents, 'run.started') ?? rawEvents[0]?.occurredAt ?? new Date(0).toISOString();
  const completedAt = latestOccurredAt(rawEvents, 'run.completed') ?? rawEvents.at(-1)?.occurredAt ?? startedAt;
  const allCandidates = [...(run.candidates ?? []), ...(run.child ? [run.child] : [])];
  const drafts: EventDraft[] = [
    draft(
      run,
      rawEvents,
      'run.configured',
      'operator',
      {
        config: {
          seed: run.caseId,
          enabledSubtypes: ['cross_domain_transfer', 'zeitgeist_synthesis'],
          caps: {
            maxPopulation: Math.max(1, allCandidates.length),
            maxGenerations: Math.max(1, run.evolution?.length ?? 1),
            energyBudget: Math.max(1, run.budget?.maxUnits ?? run.budget?.usedUnits ?? 1),
            maxSpawnDepth: Math.max(1, run.evolution?.length ?? 1),
            maxToolCalls: 1,
            wallClockTimeoutMs: 1,
          },
          modelProfile: 'kernel',
          scoringPolicyVersion: 'kernel',
          rngSeed: run.runId,
          ...(run.problemRecovery?.recoveredProblem ? { problemText: run.problemRecovery.recoveredProblem } : {}),
          ...(run.problemRecovery?.title ?? run.caseTitle
            ? { problemTitle: run.problemRecovery?.title ?? run.caseTitle }
            : {}),
        },
      },
      { occurredAt: startedAt },
    ),
    draft(run, rawEvents, 'run.started', 'runtime', { startedAt }, { occurredAt: startedAt }),
  ];

  for (const generation of run.evolution ?? []) {
    drafts.push(
      draft(
        run,
        rawEvents,
        'generation.started',
        'runtime',
        { index: generation.generation },
        { generation: generation.generation, occurredAt: startedAt },
      ),
    );
  }

  for (const agenome of run.agenomes ?? []) {
    const generation = agenome.generations?.[0] ?? 0;
    drafts.push(
      draft(
        run,
        rawEvents,
        'agenome.spawned',
        'agenome',
        {
          agenome: {
            id: agenome.id,
            runId: run.runId,
            generationId: generationId(generation),
            parentIds: agenome.parentAgenomeIds ?? [],
            systemPrompt: agenome.prompt ?? agenome.label ?? agenome.id,
            personaWeights: agenome.valueWeights ?? {},
            toolPermissions: agenome.toolPermissions ?? [],
            decompositionPolicy: agenome.decompositionPolicy ?? '',
            spawnBudget: Math.max(0, agenome.spawnBudget?.maxCandidates ?? 0),
            mutationMeta: { mutations: agenome.mutations ?? [] },
            status: 'seeded',
          },
        },
        { generation, agenomeId: agenome.id, occurredAt: startedAt },
      ),
    );
  }

  for (const candidate of allCandidates) {
    drafts.push(
      draft(
        run,
        rawEvents,
        'candidate.created',
        'agenome',
        { candidate: candidatePayload(candidate, run) },
        {
          generation: candidate.generation,
          agenomeId: candidate.agenomeId,
          candidateId: candidate.id,
          occurredAt: startedAt,
        },
      ),
    );
  }

  for (const verdict of run.criticVerdicts ?? []) {
    drafts.push(
      draft(
        run,
        rawEvents,
        'critic.reviewed',
        'critic',
        {
          review: {
            id: `${verdict.candidateId}_${verdict.criticId}`,
            candidateId: verdict.candidateId,
            mandate: criticMandate(verdict.criticId),
            scores: { [verdict.criticId]: verdict.score },
            critique: `${verdict.pressure}\n${verdict.revisionMandate}`,
            confidence: Math.max(0, Math.min(1, verdict.score / 100)),
            evidenceRefs: [{ kind: 'trace', label: verdict.criticId }],
          },
        },
        { candidateId: verdict.candidateId, occurredAt: startedAt },
      ),
    );
  }

  for (const fitness of run.fitnessRecords ?? []) {
    drafts.push(
      draft(
        run,
        rawEvents,
        'fitness.scored',
        'selection_controller',
        {
          fitness: {
            id: `fitness_${fitness.candidateId}`,
            candidateId: fitness.candidateId,
            total: fitness.total,
            components: fitness.components,
            policyVersion: 'kernel',
            explanation: fitness.rationale,
          },
        },
        { candidateId: fitness.candidateId, occurredAt: startedAt },
      ),
    );
  }

  for (const entry of run.energyLedger ?? []) {
    if (entry.kind !== 'spend') continue;
    drafts.push(
      draft(
        run,
        rawEvents,
        'energy.spent',
        'runtime',
        {
          energy: {
            id: entry.id,
            runId: run.runId,
            generationId: generationId(entry.generation),
            agenomeId: entry.agenomeId,
            eventType: 'spawn',
            estimate: entry.units,
            actual: entry.units,
            unit: 'doppl_energy',
            reason: entry.reason,
          },
        },
        {
          generation: entry.generation,
          agenomeId: entry.agenomeId,
          candidateId: entry.candidateId,
          occurredAt: startedAt,
        },
      ),
    );
  }

  for (const fusion of run.fusionChildren ?? []) {
    drafts.push(
      draft(
        run,
        rawEvents,
        'agenome.fused',
        'agenome',
        {
          reproduction: {
            id: `repro_${fusion.child.id}`,
            runId: run.runId,
            parentAgenomeIds: fusion.parentCandidateIds,
            childAgenomeId: fusion.child.agenomeId,
            mode: 'fusion',
            crossoverPoints: fusion.parentCandidateIds,
            mutationSummary: fusion.mutationNotes?.join('; ') ?? '',
          },
        },
        { generation: fusion.generation, agenomeId: fusion.child.agenomeId, occurredAt: startedAt },
      ),
    );
  }

  for (const generation of run.evolution ?? []) {
    drafts.push(
      draft(
        run,
        rawEvents,
        'generation.completed',
        'runtime',
        {
          completedAt,
          candidateCount: generation.candidateIds.length + (generation.childId ? 1 : 0),
        },
        { generation: generation.generation, occurredAt: completedAt },
      ),
    );
  }

  drafts.push(
    draft(
      run,
      rawEvents,
      'run.completed',
      'runtime',
      {
        completedAt,
        ...(run.child?.summary ? { terminalSummary: run.child.summary } : {}),
      },
      { occurredAt: completedAt },
    ),
  );

  return materialize(drafts);
}
