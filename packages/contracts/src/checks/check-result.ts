import { z } from 'zod';
import { EvidenceRef } from '../domain/evidence-ref';

/**
 * CheckStatus — the CLOSED 3-state check outcome (ARCHITECTURE.md §7). An unregistered or
 * execution-requiring check is recorded as `skipped` with a reason (KEY SAFETY RULE #3).
 */
export const CheckStatus = z.enum(['passed', 'failed', 'skipped']);

export type CheckStatus = z.infer<typeof CheckStatus>;

/**
 * CheckResult — the outcome of a subtype-specific objective check (ARCHITECTURE.md §7, Appendix A).
 * Strict 9-field object (5 required + 4 optional).
 *
 * `skipReason` is tied IFF to `skipped`: a `skipped` result MUST carry a non-empty `skipReason` (a
 * skip is always recorded with a reason — §7), and a non-skipped result must NOT carry one (that
 * state is nonsensical, so it is made unrepresentable). The schema encodes SHAPE only — `score` range
 * and `checkType` membership are not policed here (the allowlist registry is the gate, lesson §6);
 * `evidenceRefs` MAY be empty (lesson §6).
 */
export const CheckResult = z
  .strictObject({
    id: z.string().min(1),
    candidateId: z.string().min(1),
    checkType: z.string().min(1),
    status: CheckStatus,
    score: z.number().optional(),
    output: z.string().optional(),
    skipReason: z.string().min(1).optional(),
    evidenceRefs: z.array(EvidenceRef),
    error: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'skipped' && value.skipReason === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'a skipped CheckResult must carry a skipReason',
        path: ['skipReason'],
      });
    }
    if (value.status !== 'skipped' && value.skipReason !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'skipReason is only valid on a skipped CheckResult',
        path: ['skipReason'],
      });
    }
  });

export type CheckResult = z.infer<typeof CheckResult>;
