import { z } from 'zod';

/**
 * KnowledgeGraph — a WEB-LOCAL validation schema for `GET /runs/:id/knowledge` (KB slice 2). This endpoint
 * has NO frozen `@doppl/contracts` model (the ResearchNote projection is `apps/api`-owned; P0 is closed, so
 * the demo track can't add to the frozen contracts unilaterally — parallel to `RunHealth`, LESSONS §9/§34).
 * Forward-tolerant `z.object`s so the real response may carry extra fields without rejecting.
 *
 * The response is a watermark-tagged projection `{ runId, sequenceThrough, state: { notes, edges } }` where
 * `notes`/`edges` are id-keyed records (the api `buildResearchNotes`).
 */
export const ResearchNote = z.object({
  id: z.string(),
  runId: z.string(),
  generationId: z.string().nullable(),
  agenomeId: z.string().nullable(),
  toolName: z.string(),
  query: z.string().optional(),
  snippet: z.string(),
  sourceUrls: z.array(z.string()),
  sequence: z.number(),
  eventId: z.string(),
});
export type ResearchNote = z.infer<typeof ResearchNote>;

export const ResearchEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string(),
});
export type ResearchEdge = z.infer<typeof ResearchEdge>;

/** A researching agenome's graveyard status — culled (a dead-end lineage) + the cull score, if any. */
export const ResearchAgenome = z.object({
  id: z.string(),
  culled: z.boolean(),
  score: z.number().optional(),
});
export type ResearchAgenome = z.infer<typeof ResearchAgenome>;

export const KnowledgeGraph = z.object({
  runId: z.string(),
  sequenceThrough: z.number(),
  state: z.object({
    notes: z.record(z.string(), ResearchNote),
    edges: z.record(z.string(), ResearchEdge),
    // optional/forward-tolerant: an older api without the graveyard fold omits it (→ no culled marks).
    agenomes: z.record(z.string(), ResearchAgenome).optional(),
  }),
});
export type KnowledgeGraph = z.infer<typeof KnowledgeGraph>;
