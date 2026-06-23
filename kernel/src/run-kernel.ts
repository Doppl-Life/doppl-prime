import {
  assertKernelRun,
  type CandidateSolution,
  type AgenomeEnergyLedgerEntry,
  type CriticVerdict,
  type EvolutionGeneration,
  type FitnessRecord,
  type FusionResult,
  type KernelRun,
  type MemoryMode,
} from './contracts.ts';
import { loadCaseStudy } from './case-loader.ts';
import { createJsonKnowledgeGateway } from './knowledge-gateway.ts';
import {
  scoreCandidates,
  selectParents,
  checkPairCompatibility,
  type FitnessLensId,
  type FitnessScheduleMode,
} from './scoring.ts';
import { fuseCandidates } from './fusion.ts';
import { initialAgenomePool, materializeAgenomes } from './agenomes.ts';
import { createMemoryEventRecorder } from './event-store.ts';
import {
  createFixtureGenerationProviders,
  type GenerationProviders,
} from './generation-providers.ts';
import type { ModelCallRecord } from './model-gateway.ts';

function selectedCandidates(
  selectedIds: [string, string] | [],
  candidates: CandidateSolution[],
): [CandidateSolution, CandidateSolution] | [] {
  if (selectedIds.length !== 2) return [];
  const parentA = candidates.find((candidate) => candidate.id === selectedIds[0]);
  const parentB = candidates.find((candidate) => candidate.id === selectedIds[1]);
  return parentA && parentB ? [parentA, parentB] : [];
}

function modelCallRecordsFrom(providers: GenerationProviders): ModelCallRecord[] | undefined {
  const records = (providers as GenerationProviders & { modelCallRecords?: ModelCallRecord[] })
    .modelCallRecords;
  return records && records.length > 0 ? records : undefined;
}

function modelOutputEventType(record: ModelCallRecord): string {
  if (record.metadata.status === 'repair_requested') return 'model.output_repair_requested';
  if (record.metadata.status === 'repaired') return 'model.output_repaired';
  if (record.metadata.status === 'rejected') return 'model.output_rejected';
  return 'model.output_accepted';
}

function allocationUnitsForAgenome(agenomeId: string): number {
  if (agenomeId.startsWith('fused_')) return 2;
  return 3;
}

export async function runKernel(input: {
  runId: string;
  casePath: string;
  fixturePath: string;
  knowledgePacketPath: string;
  memoryMode: MemoryMode;
  generationProviders?: GenerationProviders;
  generations?: number;
  evolutionBudget?: { maxUnits: number };
  fitnessLens?: FitnessLensId;
  fitnessSchedule?: FitnessScheduleMode;
}): Promise<KernelRun> {
  const trace = createMemoryEventRecorder([], input.runId);
  const caseStudy = await loadCaseStudy(input.casePath);
  trace.push('run.started', { runId: input.runId, caseId: caseStudy.id });
  trace.push('knowledge.packet_requested', {
    targetCase: caseStudy.id,
    memoryMode: input.memoryMode,
  });

  const gateway = await createJsonKnowledgeGateway(input.knowledgePacketPath);
  const knowledgePacket = await gateway.selectPacket({
    runId: input.runId,
    targetCase: caseStudy.id,
    maxItems: 4,
  });
  trace.push('knowledge.packet_selected', {
    packetId: knowledgePacket.id,
    items: knowledgePacket.items.length,
  });
  for (const item of knowledgePacket.items) {
    trace.push('knowledge.item_injected', {
      citeHandle: item.citeHandle,
      recipientRole: 'problem_recovery',
    });
  }

  const generationProviders =
    input.generationProviders || (await createFixtureGenerationProviders(input.fixturePath));
  const generationCount = Math.max(1, Math.floor(input.generations ?? 1));
  const maxBudgetUnits = Math.max(0, Math.floor(input.evolutionBudget?.maxUnits ?? generationCount));
  const budget = {
    maxUnits: maxBudgetUnits,
    usedUnits: 0,
    remainingUnits: maxBudgetUnits,
    exhausted: maxBudgetUnits === 0,
  };

  const problemRecovery = await generationProviders.problemRecovery.recover({
    runId: input.runId,
    caseStudy,
    knowledgePacket,
  });
  trace.push('problem_recovery.created', { recoveryId: problemRecovery.id });

  const candidates: CandidateSolution[] = [];
  const criticVerdicts: CriticVerdict[] = [];
  const fitnessRecords: FitnessRecord[] = [];
  const energyLedger: AgenomeEnergyLedgerEntry[] = [];
  const allocatedAgenomes = new Set<string>();
  let agenomePool = initialAgenomePool();
  const evolution: EvolutionGeneration[] = [];
  let carryoverChild: CandidateSolution | undefined;
  let previousCriticVerdicts: CriticVerdict[] = [];
  let selectedParents: [CandidateSolution, CandidateSolution] | [] = [];
  let fusion: FusionResult | undefined;
  const fusionChildren: FusionResult[] = [];

  function recordEnergy(entry: Omit<AgenomeEnergyLedgerEntry, 'id'>): void {
    const ledgerEntry = {
      id: `energy_${energyLedger.length}`,
      ...entry,
    };
    energyLedger.push(ledgerEntry);
    trace.push(
      ledgerEntry.kind === 'allocation' ? 'agenome.energy_allocated' : 'agenome.energy_spent',
      {
        ledgerEntryId: ledgerEntry.id,
        agenomeId: ledgerEntry.agenomeId,
        generation: ledgerEntry.generation,
        units: ledgerEntry.units,
        reason: ledgerEntry.reason,
        candidateId: ledgerEntry.candidateId,
      },
      { actor: 'agenome', agenomeId: ledgerEntry.agenomeId, candidateId: ledgerEntry.candidateId },
    );
  }

  function ensureAgenomeAllocation(agenomeId: string, generation: number): void {
    if (allocatedAgenomes.has(agenomeId)) return;
    allocatedAgenomes.add(agenomeId);
    recordEnergy({
      agenomeId,
      generation,
      kind: 'allocation',
      units: allocationUnitsForAgenome(agenomeId),
      reason: 'spawn_budget_opened',
    });
  }

  for (let generation = 0; generation < generationCount; generation += 1) {
    if (budget.remainingUnits < 1) {
      budget.exhausted = true;
      trace.push('evolution.budget_exhausted', {
        generation,
        maxUnits: budget.maxUnits,
        usedUnits: budget.usedUnits,
      });
      break;
    }
    trace.push('generation.started', { generation });
    const freshCandidates = await generationProviders.candidateGenerator.generate({
      runId: input.runId,
      caseStudy,
      problemRecovery,
      knowledgePacket,
      generation,
      previousChild: carryoverChild,
      previousCriticVerdicts,
      agenomePool,
    });
    candidates.push(...freshCandidates);
    for (const candidate of freshCandidates) {
      ensureAgenomeAllocation(candidate.agenomeId, generation);
      recordEnergy({
        agenomeId: candidate.agenomeId,
        generation,
        kind: 'spend',
        units: 1,
        reason: 'candidate_generated',
        candidateId: candidate.id,
      });
      trace.push('candidate.created', {
        candidateId: candidate.id,
        agenomeId: candidate.agenomeId,
        generation,
      });
    }

    const generationCandidates = carryoverChild
      ? [carryoverChild, ...freshCandidates]
      : freshCandidates;
    const generationVerdicts = await generationProviders.criticCouncil.judge({
      runId: input.runId,
      caseStudy,
      problemRecovery,
      candidates: generationCandidates,
      knowledgePacket,
    });
    previousCriticVerdicts = generationVerdicts;
    criticVerdicts.push(...generationVerdicts);
    for (const verdict of generationVerdicts) {
      trace.push('critic.verdict_recorded', {
        candidateId: verdict.candidateId,
        criticId: verdict.criticId,
        score: verdict.score,
        generation,
      });
    }

    const generationFitnessRecords = scoreCandidates(generationVerdicts, {
      generation,
      schedule: input.fitnessSchedule,
      lens: input.fitnessLens,
    });
    fitnessRecords.push(...generationFitnessRecords);
    for (const fitness of generationFitnessRecords) {
      trace.push('fitness.scored', {
        candidateId: fitness.candidateId,
        total: fitness.total,
        axes: fitness.selection?.axes,
        weights: fitness.selection?.weights,
        dial: fitness.selection?.dial,
        decay: fitness.selection?.decay,
        lens: fitness.selection?.lens,
        generation,
      });
    }

    selectedParents = selectedCandidates(selectParents(generationFitnessRecords), generationCandidates);
    fusion = undefined;
    if (selectedParents.length === 2) {
      const compatibility = checkPairCompatibility(selectedParents[0].id, selectedParents[1].id);
      trace.push('pair.compatibility_checked', { ...compatibility, generation });
      fusion = fuseCandidates({
        caseId: caseStudy.id,
        parentA: selectedParents[0],
        parentB: selectedParents[1],
        parentAScore: generationFitnessRecords.find(
          (record) => record.candidateId === selectedParents[0].id,
        )!.total,
        parentBScore: generationFitnessRecords.find(
          (record) => record.candidateId === selectedParents[1].id,
        )!.total,
        compatibility,
      });
      trace.push('candidate.fused', {
        childId: fusion.child.id,
        inheritanceWeights: fusion.inheritanceWeights,
        generation,
      });
      ensureAgenomeAllocation(fusion.child.agenomeId, generation);
      recordEnergy({
        agenomeId: fusion.child.agenomeId,
        generation,
        kind: 'spend',
        units: 1,
        reason: 'fusion_child_created',
        candidateId: fusion.child.id,
      });
      fusionChildren.push(fusion);
      carryoverChild = fusion.child;
      agenomePool = materializeAgenomes({ candidates, fusions: fusionChildren, energyLedger });
    }
    evolution.push({
      generation,
      candidateIds: generationCandidates.map((candidate) => candidate.id),
      selectedParentIds:
        selectedParents.length === 2 ? [selectedParents[0].id, selectedParents[1].id] : [],
      childId: fusion?.child.id,
      fitnessTotals: generationFitnessRecords.map((fitness) => ({
        candidateId: fitness.candidateId,
        total: fitness.total,
      })),
    });
    budget.usedUnits += 1;
    budget.remainingUnits = Math.max(0, budget.maxUnits - budget.usedUnits);
    budget.exhausted = budget.remainingUnits === 0 && generation + 1 < generationCount;
    trace.push('generation.completed', {
      generation,
      childId: fusion?.child.id || null,
      budgetUsedUnits: budget.usedUnits,
      budgetRemainingUnits: budget.remainingUnits,
    });
  }
  const agenomes = materializeAgenomes({ candidates, fusions: fusionChildren, energyLedger });
  for (const agenome of agenomes) {
    trace.push(
      'agenome.materialized',
      {
        agenomeId: agenome.id,
        label: agenome.label,
        parentAgenomeIds: agenome.parentAgenomeIds,
        mutations: agenome.mutations,
        energy: agenome.energy,
        candidateIds: agenome.candidateIds,
      },
      { actor: 'agenome', agenomeId: agenome.id },
    );
  }
  const modelCallRecords = modelCallRecordsFrom(generationProviders);
  for (const record of modelCallRecords || []) {
    trace.push(modelOutputEventType(record), {
      callId: record.id,
      purpose: record.purpose,
      provider: record.provider,
      model: record.model,
      status: record.metadata.status || 'accepted',
    });
  }
  trace.push('run.completed', {
    runId: input.runId,
    childId: fusion?.child.id || null,
  });

  return assertKernelRun({
    id: input.runId,
    caseStudy,
    memoryMode: input.memoryMode,
    knowledgePacket,
    energyLedger,
    agenomes,
    problemRecovery,
    candidates,
    criticVerdicts,
    fitnessRecords,
    selectedParents,
    fusion,
    fusionChildren,
    evolution,
    budget,
    events: trace.events,
    modelCallRecords,
  });
}
