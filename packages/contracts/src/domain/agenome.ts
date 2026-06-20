import { z } from 'zod';

/**
 * AgenomeStatus — the CLOSED 7-state Agenome lifecycle (ARCHITECTURE.md §3 state machine):
 * `seeded → active → spent → eligible_parent`; `active → failed`; `eligible_parent → reproduced |
 * culled`. The kernel (P3) drives the transitions; this freezes the state enum only.
 */
export const AgenomeStatus = z.enum([
  'seeded',
  'active',
  'spent',
  'eligible_parent',
  'failed',
  'reproduced',
  'culled',
]);

export type AgenomeStatus = z.infer<typeof AgenomeStatus>;

/**
 * Agenome — the agent-genome unit (ARCHITECTURE.md §3, Appendix A). Strict 11-field object: identity
 * + lineage + traits + a HINT spawn budget + optional mutation provenance + lifecycle status.
 *
 * The schema encodes SHAPE only — kernel rules are NOT enforced here: `parentIds` count (0–2) is a §3
 * relationship rule the kernel polices, and `spawnBudget` is an allocation HINT the kernel clamps to
 * `min(remaining caps)` (key safety rule #1). So a buggy producer's out-of-range value still parses
 * structurally and the kernel rejects it with an event, rather than the schema masking the bug.
 */
export const Agenome = z.strictObject({
  id: z.string().min(1),
  runId: z.string().min(1),
  generationId: z.string().min(1),
  parentIds: z.array(z.string().min(1)),
  systemPrompt: z.string().min(1),
  personaWeights: z.record(z.string(), z.number()),
  toolPermissions: z.array(z.string().min(1)),
  decompositionPolicy: z.string().min(1),
  spawnBudget: z.int().nonnegative(),
  mutationMeta: z
    .strictObject({
      mode: z.string().optional(),
      mutatedFields: z.array(z.string()).optional(),
      summary: z.string().optional(),
    })
    .optional(),
  status: AgenomeStatus,
});

export type Agenome = z.infer<typeof Agenome>;
