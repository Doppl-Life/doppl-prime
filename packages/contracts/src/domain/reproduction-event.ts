import { z } from 'zod';

/**
 * ReproductionMode — the CLOSED 4-member union of breeding modes (ARCHITECTURE.md §8/§3). Two-level
 * fusion = agenome-level `crossover` + output-level `output_synthesis`; `mutation_only` is the
 * degenerate <2-parent fallback (§3). Any other value is rejected.
 */
export const ReproductionMode = z.enum(['fusion', 'crossover', 'output_synthesis', 'mutation_only']);

export type ReproductionMode = z.infer<typeof ReproductionMode>;

/**
 * ReproductionEvent — a breeding event with PERSISTED RNG outcomes (ARCHITECTURE.md §8/§3, Appendix A
 * line 478). Strict 7-field object.
 *
 * KEY SAFETY RULE #7 (replay calls no providers / re-samples nothing): `crossoverPoints` (the splice
 * indices) and `mutationSummary` (trait → concrete applied value) are the REQUIRED persisted RNG
 * outcomes — replay reconstructs the child from the STORED outcomes and never re-samples (§4). Both
 * are non-optional; `mutationSummary` is a string|number|boolean record (NOT `z.unknown`) so it stays
 * inspectable for replay-diffing. The schema encodes SHAPE only — `parentAgenomeIds` count (0–2) is a
 * kernel relationship rule (§6), and `mutation_only` legitimately has fewer than 2 parents.
 */
export const ReproductionEvent = z.strictObject({
  id: z.string().min(1),
  runId: z.string().min(1),
  parentAgenomeIds: z.array(z.string().min(1)),
  childAgenomeId: z.string().min(1),
  mode: ReproductionMode,
  crossoverPoints: z.array(z.int()),
  mutationSummary: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

export type ReproductionEvent = z.infer<typeof ReproductionEvent>;
