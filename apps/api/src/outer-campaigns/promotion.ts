import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  GenerationOperator,
  RunCaps,
  type CandidateIdea,
  type FitnessScore,
  type JudgeResult,
  type NoveltyScore,
  type RunConfig,
} from '@doppl/contracts';
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
import {
  appendAndStartInnerRun,
  validateRunConfigForStart,
} from '../runs/start-inner-run';
import { type ModelRouteOverrideAllowlist } from '../model-gateway/model-route-override';

export interface OuterCampaignPromotionDeps {
  store: EventStore;
  db: NodePgDatabase;
  newId: () => string;
  defaultConfig: RunConfig;
  modelRouteOverrideAllowlist: ModelRouteOverrideAllowlist;
  onRunConfigured?: (runId: string) => void;
}

type ChildRunRow = typeof outerCampaignChildRuns.$inferSelect;
type CampaignArtifactRow = typeof outerCampaignArtifacts.$inferSelect;
type CampaignRow = typeof outerCampaigns.$inferSelect;

const PROMOTABLE_STAGES = new Set(['problem_recovery', 'doppl']);
const TERMINAL_EVENT_TYPES = new Set(['run.completed', 'run.failed', 'run.stopped', 'run.cancelled']);

export async function syncOuterCampaignPromotions(
  deps: OuterCampaignPromotionDeps,
): Promise<{ promoted: number; terminalized: number; started: number }> {
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
  const started = await startPendingDopplChildRuns(deps);
  return { promoted, terminalized, started };
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

async function startPendingDopplChildRuns(deps: OuterCampaignPromotionDeps): Promise<number> {
  const recoveries: CampaignArtifactRow[] = await deps.db
    .select()
    .from(outerCampaignArtifacts)
    .where(
      and(
        eq(outerCampaignArtifacts.stage, 'problem_recovery'),
        eq(outerCampaignArtifacts.status, 'selected'),
      ),
    );

  let started = 0;
  for (const recovery of recoveries) {
    const [existing] = await deps.db
      .select()
      .from(outerCampaignChildRuns)
      .where(
        and(
          eq(outerCampaignChildRuns.parentArtifactId, recovery.id),
          eq(outerCampaignChildRuns.stage, 'doppl'),
        ),
      )
      .limit(1);
    if (existing !== undefined) continue;

    const [campaign] = await deps.db
      .select()
      .from(outerCampaigns)
      .where(eq(outerCampaigns.id, recovery.campaignId))
      .limit(1);
    if (campaign === undefined) continue;

    const [root] = await deps.db
      .select()
      .from(outerCampaignArtifacts)
      .where(
        and(
          eq(outerCampaignArtifacts.campaignId, recovery.campaignId),
          eq(outerCampaignArtifacts.stage, 'case_study'),
        ),
      )
      .limit(1);
    if (root === undefined) continue;

    const childRunId = deps.newId();
    const childRunRecordId = deps.newId();
    const config = buildDopplChildRunConfig(deps.defaultConfig, campaign, root, recovery);
    const validated = validateRunConfigForStart(config as unknown as Record<string, unknown>, deps);
    if (!validated.ok) continue;

    await deps.db.insert(outerCampaignChildRuns).values({
      id: childRunRecordId,
      campaignId: recovery.campaignId,
      runId: childRunId,
      stage: 'doppl',
      parentArtifactId: recovery.id,
      status: 'running',
    });
    await appendAndStartInnerRun(validated.config, deps, { runId: childRunId });
    started += 1;
  }
  return started;
}

function buildDopplChildRunConfig(
  defaultConfig: RunConfig,
  campaign: CampaignRow,
  root: CampaignArtifactRow,
  recovery: CampaignArtifactRow,
): RunConfig {
  const settings = parseCampaignSettings(campaign.settings);
  return {
    ...defaultConfig,
    seed: [
      `Title: ${campaign.title}`,
      'Mode: grow Doppl',
      'Direction: diverge',
      '',
      'Stage task: produce Doppls, meaning solution/findings candidates against the selected recovered problem.',
      'Each candidate should make a clear claim, implications, opportunities, sprouts, and proof signals.',
      'Prefer novel, divergent mechanisms while staying tied to the parent problem.',
      '',
      `Case study: ${root.label}`,
      root.summary,
      '',
      `Selected problem recovery: ${recovery.label}`,
      recovery.summary,
      '',
      'Problem recovery source:',
      recovery.body,
    ].join('\n'),
    caps: settings.caps ?? defaultConfig.caps,
    rngSeed: stableUint32(`${campaign.id}\n${recovery.id}\ndoppl`),
    ...(settings.generationOperators.length > 0
      ? { generationOperators: settings.generationOperators }
      : {}),
    generationBias: settings.generationBias > 0 ? settings.generationBias : 0.45,
  };
}

interface ParsedCampaignSettings {
  caps?: RunConfig['caps'];
  generationOperators: NonNullable<RunConfig['generationOperators']>;
  generationBias: number;
}

function parseCampaignSettings(value: unknown): ParsedCampaignSettings {
  const record = isRecord(value) ? value : {};
  const caps = RunCaps.safeParse(record.caps);
  const operators = GenerationOperator.array().safeParse(record.generationOperators);
  const generationBias = typeof record.generationBias === 'number' ? record.generationBias : 0;
  return {
    ...(caps.success ? { caps: caps.data } : {}),
    generationOperators: operators.success ? operators.data : [],
    generationBias,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableUint32(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
