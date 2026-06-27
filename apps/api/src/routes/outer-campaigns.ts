import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { RunConfig as RunConfigSchema, type RunConfig } from '@doppl/contracts';
import { z } from 'zod';
import type { EventStore } from '../event-store';
import {
  outerCampaignArtifacts,
  outerCampaignChildRuns,
  outerCampaigns,
} from '../event-store/schema';
import { type ModelRouteOverrideAllowlist } from '../model-gateway/model-route-override';
import { compileCaseStudyNode } from '../markscript/compiler';
import { appendAndStartInnerRun, validateRunConfigForStart } from '../runs/start-inner-run';

export interface OuterCampaignRoutesDeps {
  store: EventStore;
  db: NodePgDatabase;
  defaultConfig: RunConfig;
  modelRouteOverrideAllowlist: ModelRouteOverrideAllowlist;
  newId: () => string;
  onRunConfigured?: (runId: string) => void;
}

const StartOuterCampaignBody = z.object({
  title: z.string().trim().min(1),
  synopsis: z.string().default(''),
  seedText: z.string().default(''),
  generationMode: z.enum(['recover_problem', 'grow_doppl', 'campaign']).default('recover_problem'),
  direction: z.enum(['auto', 'converge', 'diverge']).default('auto'),
  runConfig: RunConfigSchema,
});

export function registerOuterCampaignRoutes(
  app: FastifyInstance,
  deps: OuterCampaignRoutesDeps,
): void {
  app.post('/outer-campaigns', async (request, reply) => {
    const parsed = StartOuterCampaignBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_outer_campaign',
        message: parsed.error.issues.map((issue) => issue.path.join('.') || issue.code).join(', '),
      });
    }
    const body = parsed.data;

    const validated = validateRunConfigForStart(
      body.runConfig as unknown as Record<string, unknown>,
      deps,
    );
    if (!validated.ok) return reply.status(validated.statusCode).send(validated.body);
    const config: RunConfig = validated.config;

    const campaignId = deps.newId();
    const rootArtifactId = deps.newId();
    const childRunId = deps.newId();
    const childRunRecordId = deps.newId();
    const compiledRoot = compileCaseStudyNode({
      id: rootArtifactId,
      title: body.title,
      synopsis: body.synopsis,
      context: body.seedText || config.seed,
      next: 'problem_recovery',
    });
    const nowSettings = {
      generationMode: body.generationMode,
      direction: body.direction,
      caps: config.caps,
      generationOperators: config.generationOperators ?? [],
      generationBias: config.generationBias ?? 0,
    };

    await deps.db.transaction(async (tx) => {
      await tx.insert(outerCampaigns).values({
        id: campaignId,
        title: body.title,
        synopsis: body.synopsis,
        status: 'running',
        rootArtifactId,
        settings: nowSettings,
      });
      await tx.insert(outerCampaignArtifacts).values({
        id: rootArtifactId,
        campaignId,
        stage: 'case_study',
        label: compiledRoot.title,
        summary: compiledRoot.summary,
        body: compiledRoot.markdown,
        status: 'running',
        parentArtifactId: null,
        sourceRunId: childRunId,
        sourceCandidateId: null,
        sourceSequenceThrough: null,
        score: null,
        novelty: null,
        judgeAcceptance: null,
        artifactPath: `outer-campaigns/${campaignId}/case-study.md`,
      });
      await tx.insert(outerCampaignChildRuns).values({
        id: childRunRecordId,
        campaignId,
        runId: childRunId,
        stage: firstChildStageForMode(body.generationMode),
        parentArtifactId: rootArtifactId,
        status: 'running',
      });
    });

    await appendAndStartInnerRun(config, deps, { runId: childRunId });

    return reply.status(201).send({
      campaignId,
      rootArtifactId,
      activeRunIds: [childRunId],
    });
  });
}

function firstChildStageForMode(mode: z.infer<typeof StartOuterCampaignBody>['generationMode']): string {
  return mode === 'grow_doppl' ? 'doppl' : 'problem_recovery';
}
