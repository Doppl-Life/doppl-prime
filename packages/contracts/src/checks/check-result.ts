import { z } from "zod";
import { EvidenceRef } from "../domain/evidence-ref.js";

/**
 * CheckResult (ARCHITECTURE.md §7, IMPLEMENTATION_PLAN.md P0.7).
 *
 * A skipped result requires a skipReason — the refinement encodes the
 * "unregistered/execution-requiring check is recorded as skipped with
 * reason" invariant so an emitter cannot drop the reason silently.
 */

export const CheckStatusValues = ["passed", "failed", "skipped"] as const;
export const CheckStatus = z.enum(CheckStatusValues);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const CheckResult = z
  .object({
    id: z.string().min(1),
    candidateId: z.string().min(1),
    checkType: z.string().min(1),
    status: CheckStatus,
    score: z.number().optional(),
    output: z.unknown().optional(),
    skipReason: z.string().min(1).optional(),
    evidenceRefs: z.array(EvidenceRef),
    error: z.string().optional(),
  })
  .strict()
  .refine((r) => r.status !== "skipped" || !!r.skipReason, {
    message: "skipped CheckResult requires skipReason",
    path: ["skipReason"],
  });
export type CheckResult = z.infer<typeof CheckResult>;
