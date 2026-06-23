import { z } from 'zod';

/**
 * ProblemSet — a WEB-LOCAL validation mirror of the api runtime-config schema served by GET /problem-sets
 * (PD.5a). It has NO frozen `@doppl/contracts` model (ProblemSet is api runtime config, not an Appendix-A
 * model; P0 is closed, so the demo track can't add to the frozen contracts unilaterally) — so it is
 * mirrored web-locally, EXACTLY parallel to the web-local `RunHealth` (apps/web L§9). A forward-tolerant
 * `z.object` (the real response may carry extra fields without rejecting). Each problem is curated,
 * non-sensitive `{id, title, prompt}`; the selected `prompt` becomes `RunConfig.seed` on the existing
 * POST /runs partial-{seed} path (PD.10 isolates it as wrapUntrusted DATA).
 *
 * INTEGRATION CARRY-FORWARD (demo→cody merge): PROMOTE ProblemSet to a shared frozen contract (with the
 * RunHealth promotion) if a frozen catalog contract is wanted later — a contract-coordinated amendment.
 */
export const ProblemSet = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
});
export type ProblemSet = z.infer<typeof ProblemSet>;

export const ProblemSets = z.array(ProblemSet);
export type ProblemSets = z.infer<typeof ProblemSets>;

/** The GET /problem-sets response envelope: `{ problemSets: ProblemSet[] }`. */
export const ProblemSetsResponse = z.object({ problemSets: ProblemSets });
export type ProblemSetsResponse = z.infer<typeof ProblemSetsResponse>;
