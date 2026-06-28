import { z } from 'zod';

export const OuterBloomStage = z.enum(['case_study', 'problem_recovery', 'doppl']);
export type OuterBloomStage = z.infer<typeof OuterBloomStage>;

export const OuterBloomNode = z.object({
  id: z.string(),
  runId: z.string(),
  stage: OuterBloomStage,
  label: z.string(),
  summary: z.string(),
  status: z.string(),
  parentId: z.string().nullable(),
  generationIndex: z.number().nullable(),
  score: z.number().nullable(),
  novelty: z.number().nullable(),
  judgeAcceptance: z.number().nullable(),
  sourceId: z.string().nullable(),
  agenomeId: z.string().nullable(),
  body: z.string().optional(),
});
export type OuterBloomNode = z.infer<typeof OuterBloomNode>;

export const OuterBloomEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string(),
});
export type OuterBloomEdge = z.infer<typeof OuterBloomEdge>;

export const OuterBloomIsland = z.object({
  runId: z.string(),
  seed: z.string(),
  status: z.string().nullable(),
  sequenceThrough: z.number(),
  nodes: z.array(OuterBloomNode),
  edges: z.array(OuterBloomEdge),
});
export type OuterBloomIsland = z.infer<typeof OuterBloomIsland>;

export const OuterBloomProjection = z.object({
  islands: z.array(OuterBloomIsland),
  totals: z.object({
    runs: z.number(),
    nodes: z.number(),
    problemRecoveries: z.number(),
    doppls: z.number(),
    selected: z.number(),
  }),
});
export type OuterBloomProjection = z.infer<typeof OuterBloomProjection>;

export const DeleteOuterBloomNodeResult = z.object({
  nodeId: z.string(),
  deleted: z.number(),
  nodeIds: z.array(z.string()),
  mode: z.enum(['deleted', 'hidden']).optional(),
});
export type DeleteOuterBloomNodeResult = z.infer<typeof DeleteOuterBloomNodeResult>;
