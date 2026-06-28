import { z } from 'zod';

/**
 * CaseStudyGraph — a WEB-LOCAL validation schema for `GET /case-studies/:id/graph` (Islands pivot A3). This
 * endpoint has NO frozen `@doppl/contracts` model (the cross-run case-study projection is `apps/api`-owned —
 * parallel to `KnowledgeGraph`/`RunHealth`, LESSONS §9/§34). Forward-tolerant `z.object`s so the real
 * response may carry extra fields without rejecting.
 *
 * Shape: a case study → its runs (newest-first) → each run's doppels (the crowned winners). The join key
 * recovering the islands graph (caseStudyId rides the run.configured payload, A1).
 */
export const CaseStudyDoppel = z.object({
  candidateId: z.string(),
  title: z.string(),
  summary: z.string(),
});
export type CaseStudyDoppel = z.infer<typeof CaseStudyDoppel>;

export const CaseStudyRunNode = z.object({
  runId: z.string(),
  status: z.string().nullable(),
  problem: z.string().nullable(),
  createdAt: z.string().nullable(),
  doppels: z.array(CaseStudyDoppel),
});
export type CaseStudyRunNode = z.infer<typeof CaseStudyRunNode>;

export const CaseStudyGraph = z.object({
  caseStudyId: z.string(),
  runs: z.array(CaseStudyRunNode),
});
export type CaseStudyGraph = z.infer<typeof CaseStudyGraph>;
