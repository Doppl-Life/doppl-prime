import type { CandidateSolution, KernelRun, MemoryMode } from './contracts.ts';
import { loadCaseStudy } from './case-loader.ts';
import { createJsonKnowledgeGateway } from './knowledge-gateway.ts';
import { loadKernelFixture } from './fixtures.ts';
import { scoreCandidates, selectParents, checkPairCompatibility } from './scoring.ts';
import { fuseCandidates } from './fusion.ts';
import { createMemoryEventRecorder } from './event-store.ts';

function selectedCandidates(
  selectedIds: [string, string] | [],
  candidates: CandidateSolution[],
): [CandidateSolution, CandidateSolution] | [] {
  if (selectedIds.length !== 2) return [];
  const parentA = candidates.find((candidate) => candidate.id === selectedIds[0]);
  const parentB = candidates.find((candidate) => candidate.id === selectedIds[1]);
  return parentA && parentB ? [parentA, parentB] : [];
}

export async function runKernel(input: {
  runId: string;
  casePath: string;
  fixturePath: string;
  knowledgePacketPath: string;
  memoryMode: MemoryMode;
}): Promise<KernelRun> {
  const trace = createMemoryEventRecorder();
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

  const fixture = await loadKernelFixture(input.fixturePath);
  if (fixture.caseId !== caseStudy.id) {
    throw new Error(`fixture case ${fixture.caseId} does not match loaded case ${caseStudy.id}`);
  }

  const problemRecovery = {
    id: `recovery_${caseStudy.id}`,
    caseId: caseStudy.id,
    ...fixture.problemRecovery,
    citedKnowledge: knowledgePacket.items.map((item) => item.citeHandle),
  };
  trace.push('problem_recovery.created', { recoveryId: problemRecovery.id });

  const candidates = fixture.candidates.map((candidate) => ({
    ...candidate,
    caseId: caseStudy.id,
    generation: 0,
  }));
  for (const candidate of candidates) {
    trace.push('candidate.created', {
      candidateId: candidate.id,
      agenomeId: candidate.agenomeId,
    });
  }

  const criticVerdicts = fixture.critics;
  for (const verdict of criticVerdicts) {
    trace.push('critic.verdict_recorded', {
      candidateId: verdict.candidateId,
      criticId: verdict.criticId,
      score: verdict.score,
    });
  }

  const fitnessRecords = scoreCandidates(criticVerdicts);
  for (const fitness of fitnessRecords) {
    trace.push('fitness.scored', {
      candidateId: fitness.candidateId,
      total: fitness.total,
    });
  }

  const selectedParents = selectedCandidates(selectParents(fitnessRecords), candidates);
  let fusion;
  if (selectedParents.length === 2) {
    const compatibility = checkPairCompatibility(selectedParents[0].id, selectedParents[1].id);
    trace.push('pair.compatibility_checked', { ...compatibility });
    fusion = fuseCandidates({
      caseId: caseStudy.id,
      parentA: selectedParents[0],
      parentB: selectedParents[1],
      parentAScore: fitnessRecords.find((record) => record.candidateId === selectedParents[0].id)!
        .total,
      parentBScore: fitnessRecords.find((record) => record.candidateId === selectedParents[1].id)!
        .total,
      compatibility,
    });
    trace.push('candidate.fused', {
      childId: fusion.child.id,
      inheritanceWeights: fusion.inheritanceWeights,
    });
  }
  trace.push('run.completed', {
    runId: input.runId,
    childId: fusion?.child.id || null,
  });

  return {
    id: input.runId,
    caseStudy,
    memoryMode: input.memoryMode,
    knowledgePacket,
    problemRecovery,
    candidates,
    criticVerdicts,
    fitnessRecords,
    selectedParents,
    fusion,
    events: trace.events,
  };
}
