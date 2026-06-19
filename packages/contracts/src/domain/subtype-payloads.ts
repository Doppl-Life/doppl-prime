import { z } from "zod";

/**
 * Subtype payloads for CandidateIdea — the closed two-member SubtypeName
 * discriminator selects exactly one of these shapes via the discriminated
 * union in candidate-idea.ts (ARCHITECTURE.md §3, DATA_MODEL.md).
 */

export const SubtypeNameValues = ["cross_domain_transfer", "zeitgeist_synthesis"] as const;

export const SubtypeName = z.enum(SubtypeNameValues);
export type SubtypeName = z.infer<typeof SubtypeName>;

export const CrossDomainTransferPayload = z
  .object({
    sourceDomain: z.string().min(1),
    sourceTechnique: z.string().min(1),
    targetDomain: z.string().min(1),
    targetProblem: z.string().min(1),
    transferMapping: z.string().min(1),
    expectedMechanism: z.string().min(1),
    executableCheckIdea: z.string().optional(),
  })
  .strict();
export type CrossDomainTransferPayload = z.infer<typeof CrossDomainTransferPayload>;

export const ZeitgeistSynthesisPayload = z
  .object({
    thesis: z.string().min(1),
    audience: z.string().min(1),
    currentSignals: z.array(z.string()),
    whyNow: z.string().min(1),
    falsifiablePredictions: z.array(z.string()),
    comparablePriorArt: z.array(z.string()),
  })
  .strict();
export type ZeitgeistSynthesisPayload = z.infer<typeof ZeitgeistSynthesisPayload>;
