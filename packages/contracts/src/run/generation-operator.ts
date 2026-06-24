import { z } from 'zod';

/**
 * GenerationOperator — the CLOSED 7-member allowlist of mutagen ideation skills (frontend-v2 FB.0,
 * ARCHITECTURE.md §4). snake_case machine-truth (DS rule 5). When a run selects operator(s), they
 * shape the GENERATION prompt as KEY SAFETY RULE #5 isolated DATA (sentinel-delimited, never
 * instructions — FB.3 wires that), recorded as a generation input. An operator is NEVER a cap or a
 * scoring/judge lever (rule #1/#6): caps stay kernel-enforced; the held-out judge anchor is unmoved.
 * Any other value is rejected (lesson §1 closed-union discipline).
 */
export const GenerationOperator = z.enum([
  'breakthrough',
  'first_principles',
  'polymath',
  'breakout',
  'blindside',
  'subtraction',
  'constraint',
]);

export type GenerationOperator = z.infer<typeof GenerationOperator>;
