import type { CandidateIdea } from '@doppl/contracts';
import { buildCurrentState, type CurrentState } from './current-state';
import type { RunEventRow } from './projection-builder';

export type OuterBloomStage = 'case_study' | 'problem_recovery' | 'doppl';

export interface OuterBloomNode {
  id: string;
  runId: string;
  stage: OuterBloomStage;
  label: string;
  summary: string;
  status: string;
  parentId: string | null;
  generationIndex: number | null;
  score: number | null;
  novelty: number | null;
  judgeAcceptance: number | null;
  sourceId: string | null;
  agenomeId: string | null;
  body?: string;
}

export interface OuterBloomEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface OuterBloomIsland {
  runId: string;
  seed: string;
  status: string | null;
  sequenceThrough: number;
  nodes: OuterBloomNode[];
  edges: OuterBloomEdge[];
}

export interface OuterBloomProjection {
  islands: OuterBloomIsland[];
  totals: {
    runs: number;
    nodes: number;
    problemRecoveries: number;
    doppls: number;
    selected: number;
  };
}

export function buildOuterBloomForRun(events: readonly RunEventRow[]): OuterBloomIsland {
  const { runId, sequenceThrough, state } = buildCurrentState(events);
  const rootId = `${runId}:seed`;
  const recoveryId = `${runId}:problem-recovery`;
  const seed = readSeed(events) ?? runId;
  // The inner runtime currently persists generated outputs as candidate_ideas.
  // The outer bloom presents those selected artifacts as Doppl leaves; the
  // inner "candidate" vocabulary should not leak past this adapter boundary.
  const doppls = Object.values(state.candidateIdeas).sort(compareDoppls);
  const scoresBySource = fitnessScoresBySource(state);
  const noveltyBySource = noveltyScoresBySource(state);
  const judgeBySource = judgeResultsBySource(state);
  const parentAgenomeByChildAgenome = parentAgenomeIndex(state);
  const firstDopplByAgenome = firstDopplIndex(doppls);

  const nodes: OuterBloomNode[] = [
    {
      id: rootId,
      runId,
      stage: 'case_study',
      label: labelFromSeed(seed),
      summary: seed,
      status: state.runs[runId]?.status ?? 'configured',
      parentId: null,
      generationIndex: null,
      score: null,
      novelty: null,
      judgeAcceptance: null,
      sourceId: null,
      agenomeId: null,
    },
  ];
  const edges: OuterBloomEdge[] = [];

  if (doppls.length > 0) {
    nodes.push({
      id: recoveryId,
      runId,
      stage: 'problem_recovery',
      label: problemRecoveryLabel(doppls),
      summary: problemRecoverySummary(doppls, seed),
      status: state.runs[runId]?.status ?? 'recovered',
      parentId: rootId,
      generationIndex: null,
      score: null,
      novelty: null,
      judgeAcceptance: null,
      sourceId: null,
      agenomeId: null,
    });
    edges.push({
      id: `${rootId}->${recoveryId}`,
      source: rootId,
      target: recoveryId,
      type: 'recovered',
    });
  }

  for (const candidate of doppls) {
    const parentAgenomeId = parentAgenomeByChildAgenome.get(candidate.agenomeId) ?? null;
    const parentDoppl = parentAgenomeId ? (firstDopplByAgenome.get(parentAgenomeId) ?? null) : null;
    const parentId = parentDoppl?.id ?? recoveryId;
    const score = scoresBySource.get(candidate.id)?.total ?? null;
    const novelty = noveltyBySource.get(candidate.id)?.score ?? null;
    const judgeAcceptance = judgeBySource.get(candidate.id)?.acceptance ?? null;

    nodes.push({
      id: candidate.id,
      runId,
      stage: 'doppl',
      label: candidate.title,
      summary: candidate.summary,
      status: candidate.status,
      parentId,
      generationIndex: generationIndexOf(candidate.generationId),
      score,
      novelty,
      judgeAcceptance,
      sourceId: candidate.id,
      agenomeId: candidate.agenomeId,
    });
    edges.push({
      id: `${parentId}->${candidate.id}`,
      source: parentId,
      target: candidate.id,
      type: parentId === recoveryId ? 'solved_by' : 'descended',
    });
  }

  return {
    runId,
    seed,
    status: state.runs[runId]?.status ?? null,
    sequenceThrough,
    nodes,
    edges,
  };
}

export function buildOuterBloom(islands: readonly OuterBloomIsland[]): OuterBloomProjection {
  const sorted = [...islands].sort((a, b) => a.runId.localeCompare(b.runId));
  const doppls = sorted.reduce(
    (count, island) => count + island.nodes.filter((node) => node.stage === 'doppl').length,
    0,
  );
  const problemRecoveries = sorted.reduce(
    (count, island) =>
      count + island.nodes.filter((node) => node.stage === 'problem_recovery').length,
    0,
  );
  const selected = sorted.reduce(
    (count, island) =>
      count +
      island.nodes.filter((node) => node.stage === 'doppl' && node.status === 'selected').length,
    0,
  );
  return {
    islands: sorted,
    totals: {
      runs: sorted.length,
      nodes: sorted.reduce((count, island) => count + island.nodes.length, 0),
      problemRecoveries,
      doppls,
      selected,
    },
  };
}

function plainObject(payload: unknown): Record<string, unknown> | null {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

function readSeed(events: readonly RunEventRow[]): string | null {
  for (const event of events) {
    if (event.type !== 'run.configured') continue;
    const seed = plainObject(event.payload)?.seed;
    if (typeof seed === 'string' && seed.length > 0) return seed;
  }
  return null;
}

function labelFromSeed(seed: string): string {
  const firstLine = seed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (firstLine === undefined) return 'Untitled case study';
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
}

function generationIndexOf(generationId: string): number | null {
  const match = /-gen(\d+)$/.exec(generationId);
  return match ? Number(match[1]) : null;
}

function problemRecoveryLabel(doppls: readonly CandidateIdea[]): string {
  const targetProblem = firstTargetProblem(doppls);
  return targetProblem ?? 'Recovered problem';
}

function problemRecoverySummary(doppls: readonly CandidateIdea[], seed: string): string {
  const targetProblem = firstTargetProblem(doppls);
  if (targetProblem !== null) return targetProblem;
  return `Recovered problem space for ${labelFromSeed(seed)}.`;
}

function firstTargetProblem(doppls: readonly CandidateIdea[]): string | null {
  return doppls.map(targetProblemOf).find((problem): problem is string => problem !== null) ?? null;
}

function targetProblemOf(doppl: CandidateIdea): string | null {
  if (doppl.subtype === 'cross_domain_transfer') return doppl.subtypePayload.targetProblem;
  return doppl.subtypePayload.thesis;
}

function compareDoppls(a: CandidateIdea, b: CandidateIdea): number {
  const genA = generationIndexOf(a.generationId) ?? Number.MAX_SAFE_INTEGER;
  const genB = generationIndexOf(b.generationId) ?? Number.MAX_SAFE_INTEGER;
  if (genA !== genB) return genA - genB;
  return a.id.localeCompare(b.id);
}

function fitnessScoresBySource(state: CurrentState) {
  return new Map(Object.values(state.fitnessScores).map((score) => [score.candidateId, score]));
}

function noveltyScoresBySource(state: CurrentState) {
  return new Map(Object.values(state.noveltyScores).map((score) => [score.candidateId, score]));
}

function judgeResultsBySource(state: CurrentState) {
  return new Map(Object.values(state.judgeResults).map((judge) => [judge.candidateId, judge]));
}

function firstDopplIndex(doppls: readonly CandidateIdea[]): Map<string, CandidateIdea> {
  const byAgenome = new Map<string, CandidateIdea>();
  for (const doppl of doppls) {
    if (!byAgenome.has(doppl.agenomeId)) byAgenome.set(doppl.agenomeId, doppl);
  }
  return byAgenome;
}

function parentAgenomeIndex(state: CurrentState): Map<string, string> {
  const parents = new Map<string, string>();
  for (const edge of Object.values(state.lineageEdges)) {
    if (!parents.has(edge.target)) parents.set(edge.target, edge.source);
  }
  return parents;
}
