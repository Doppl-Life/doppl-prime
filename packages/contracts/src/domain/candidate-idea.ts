import { z } from "zod";
import { EvidenceRef } from "./evidence-ref.js";
import {
  CrossDomainTransferPayload,
  SubtypeName,
  ZeitgeistSynthesisPayload,
} from "./subtype-payloads.js";

/**
 * CandidateIdea — the unit of work the runtime produces, reviews, scores,
 * and selects. Per ARCHITECTURE.md §3 and IMPLEMENTATION_PLAN.md P0.5, the
 * subtype is a closed two-member union and subtypePayload is a
 * discriminated union over `subtype` so the wrong payload-shape for a
 * given subtype is rejected at parse time.
 */

export const CandidateStatusValues = [
  "created",
  "under_review",
  "checked",
  "scored",
  "selected",
  "rejected",
  "culled",
  "invalid",
] as const;

export const CandidateStatus = z.enum(CandidateStatusValues);
export type CandidateStatus = z.infer<typeof CandidateStatus>;

const baseCandidateFields = {
  id: z.string().min(1),
  runId: z.string().min(1),
  generationId: z.string().min(1),
  agenomeId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  explanation: z.string().min(1).optional(),
  claims: z.array(z.string()),
  evidenceRefs: z.array(EvidenceRef),
  status: CandidateStatus,
};

export const CandidateIdea = z.discriminatedUnion("subtype", [
  z
    .object({
      ...baseCandidateFields,
      subtype: z.literal(SubtypeName.enum.cross_domain_transfer),
      subtypePayload: CrossDomainTransferPayload,
    })
    .strict(),
  z
    .object({
      ...baseCandidateFields,
      subtype: z.literal(SubtypeName.enum.zeitgeist_synthesis),
      subtypePayload: ZeitgeistSynthesisPayload,
    })
    .strict(),
]);
export type CandidateIdea = z.infer<typeof CandidateIdea>;

/**
 * Helper exposing the union's top-level field-name set for the §2.5
 * snapshot test. The two variants share identical top-level keys; the
 * discriminator is `subtype`.
 */
export const CandidateIdeaFieldNames = [
  ...Object.keys(baseCandidateFields),
  "subtype",
  "subtypePayload",
].sort();
