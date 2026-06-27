import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { CandidateIdea, FitnessScore, JudgeResult, NoveltyScore } from '@doppl/contracts';
import type { EventStore, RunEventRow } from '../event-store';
import {
  outerCampaignArtifacts,
  outerCampaignChildRuns,
  outerCampaigns,
  outerPromotionDecisions,
} from '../event-store/schema';
import { buildCurrentState } from '../projections/current-state';
import type { CurrentState } from '../projections/reducers/state';
import { bestScoredSurvivor } from '../runtime/terminal/partialSummary';
import { compilePromotedNode, type SourceMetricBundle } from '../markscript/compiler';

export interface OuterCampaignPromotionDeps {
  store: EventStore;
  db: NodePgDatabase;
  newId: () => string;
}

type ChildRunRow = typeof outerCampaignChildRuns.$inferSelect;

const PROMOTABLE_STAGES = new Set(['problem_recovery', 'doppl']);
const TERMINAL_EVENT_TYPES = new Set(['run.completed', 'run.failed', 'run.stopped', 'run.cancelled']);

export async function syncOuterCampaignPromotions(
  deps: OuterCampaignPromotionDeps,
): Promise<{ promoted: number; terminalized: number }> {
  const runningChildren = await deps.db
    .select()
    .from(outerCampaignChildRuns)
    .where(eq(outerCampaignChildRuns.status, 'running'));

  let promoted = 0;
  let terminalized = 0;
  for (const child of runningChildren) {
    const outcome = await syncChildRunPromotion(deps, child);
    if (outcome.promoted) promoted += 1;
    if (outcome.terminalized) terminalized += 1;
  }
  return { promoted, terminalized };
}

async function syncChildRunPromotion(
  deps: OuterCampaignPromotionDeps,
  child: ChildRunRow,
): Promise<{ promoted: boolean; terminalized: boolean }> {
  const events = await deps.store.readByRun(child.runId);
  if (events.length === 0) return { promoted: false, terminalized: false };
  const terminal = lastTerminalEvent(events);
  if (terminal === null) return { promoted: false, terminalized: false };

  const [existingDecision] = await deps.db
    .select()
    .from(outerPromotionDecisions)
    .where(eq(outerPromotionDecisions.childRunId, child.id))
    .limit(1);
  if (existingDecision !== undefined) {
    await markChildTerminal(deps.db, child, 'promoted');
    return { promoted: false, terminalized: true };
  }

  if (terminal.type !== 'run.completed' || !PROMOTABLE_STAGES.has(child.stage)) {
    await markChildTerminal(deps.db, child, terminalStatus(terminal.type));
    return { promoted: false, terminalized: true };
  }

  const projection = buildCurrentState(events);
  const winner = selectedWinner(projection.state, events);
  if (winner === null) {
    await markChildTerminal(deps.db, child, 'completed_no_winner');
    return { promoted: false, terminalized: true };
  }

  const [parent] = await deps.db
    .select()
    .from(outerCampaignArtifacts)
    .where(eq(outerCampaignArtifacts.id, child.parentArtifactId))
    .limit(1);
  if (parent === undefined) {
    await markChildTerminal(deps.db, child, 'failed_missing_parent');
    return { promoted: false, terminalized: true };
  }

  const [root] = await deps.db
    .select()
    .from(outerCampaignArtifacts)
    .where(
      and(
        eq(outerCampaignArtifacts.campaignId, child.campaignId),
        eq(outerCampaignArtifacts.stage, 'case_study'),
      ),
    )
    .limit(1);
  if (root === undefined) {
    await markChildTerminal(deps.db, child, 'failed_missing_root');
    return { promoted: false, terminalized: true };
  }

  const stage = child.stage === 'doppl' ? 'doppl' : 'problem_recovery';
  const artifactId = deps.newId();
  const metrics = metricsForCandidate(projection.state, winner.id);
  const compiled = compilePromotedNode({
    id: artifactId,
    stage,
    rootId: root.id,
    parentIds: [parent.id],
    parentTitle: parent.label,
    parentSummary: parent.summary,
    caseTitle: root.label,
    caseSummary: root.summary,
    candidate: winner,
    metrics,
  });

  await deps.db.transaction(async (tx) => {
    await tx.insert(outerCampaignArtifacts).values({
      id: artifactId,
      campaignId: child.campaignId,
      stage,
      label: compiled.title,
      summary: compiled.summary,
      body: compiled.markdown,
      status: 'selected',
      parentArtifactId: parent.id,
      sourceRunId: child.runId,
      sourceCandidateId: winner.id,
      sourceSequenceThrough: projection.sequenceThrough,
      score: metrics.fitness?.total ?? compiled.judgeScore,
      novelty: compiled.novelty,
      judgeAcceptance: compiled.judgeAcceptance,
      artifactPath: `outer-campaigns/${child.campaignId}/${stage}-${artifactId}.md`,
    });
    await tx.insert(outerPromotionDecisions).values({
      id: deps.newId(),
      campaignId: child.campaignId,
      childRunId: child.id,
      artifactId,
      sourceCandidateId: winner.id,
      reason: 'selected_inner_winner_compiled_to_markscript',
      proof: {
        sourceRunId: child.runId,
        sourceSequenceThrough: projection.sequenceThrough,
        candidateStatus: winner.status,
        fitnessTotal: metrics.fitness?.total ?? null,
        noveltyScore: metrics.novelty?.score ?? null,
        judgeAcceptance: metrics.judge?.acceptance ?? null,
      },
    });
    await tx
      .update(outerCampaignChildRuns)
      .set({ status: 'promoted' })
      .where(eq(outerCampaignChildRuns.id, child.id));
    await tx
      .update(outerCampaignArtifacts)
      .set({ status: 'selected' })
      .where(eq(outerCampaignArtifacts.id, parent.id));
    await tx
      .update(outerCampaigns)
      .set({ status: 'running' })
      .where(eq(outerCampaigns.id, child.campaignId));
  });

  return { promoted: true, terminalized: true };
}

function selectedWinner(state: CurrentState, events: readonly RunEventRow[]): CandidateIdea | null {
  const selected = Object.values(state.candidateIdeas).find((candidate) => candidate.status === 'selected');
  if (selected !== undefined) return selected;
  const best = bestScoredSurvivor(events);
  return best !== null ? (state.candidateIdeas[best.candidateId] ?? null) : null;
}

function metricsForCandidate(state: CurrentState, candidateId: string): SourceMetricBundle {
  const fitness = Object.values(state.fitnessScores).find((score) => score.candidateId === candidateId);
  const novelty = Object.values(state.noveltyScores).find((score) => score.candidateId === candidateId);
  const judge = Object.values(state.judgeResults).find((result) => result.candidateId === candidateId);
  return {
    ...(fitness !== undefined ? { fitness: fitness as FitnessScore } : {}),
    ...(novelty !== undefined ? { novelty: novelty as NoveltyScore } : {}),
    ...(judge !== undefined ? { judge: judge as JudgeResult } : {}),
  };
}

function lastTerminalEvent(events: readonly RunEventRow[]): RunEventRow | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event !== undefined && TERMINAL_EVENT_TYPES.has(event.type)) return event;
  }
  return null;
}

async function markChildTerminal(
  db: NodePgDatabase,
  child: ChildRunRow,
  status: string,
): Promise<void> {
  await db
    .update(outerCampaignChildRuns)
    .set({ status })
    .where(eq(outerCampaignChildRuns.id, child.id));
}

function terminalStatus(type: string): string {
  if (type === 'run.failed') return 'failed';
  if (type === 'run.stopped') return 'stopped';
  if (type === 'run.cancelled') return 'cancelled';
  return 'completed';
}
