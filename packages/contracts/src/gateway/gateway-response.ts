import { z } from 'zod';
import { ProviderMeta } from './provider-meta';

/**
 * ValidationResult — the CLOSED structured-output validation outcome (ARCHITECTURE.md §6). A model
 * output is validated → `accepted` / `repaired` (after ≤1 repair) / `rejected`. The ≤1-repair bound
 * is a RUNTIME invariant of the gateway, not a contract field.
 */
export const ValidationResult = z.enum(['accepted', 'repaired', 'rejected']);

export type ValidationResult = z.infer<typeof ValidationResult>;

/**
 * ModelGatewayResponse — the ONLY response surface domain code uses (ARCHITECTURE.md §6, Appendix A
 * line 480). Strict object. `providerMeta` is the SHARED P0.9 {@link ProviderMeta} (imported, never
 * redefined — lesson §5); its no-secret pin propagates here.
 *
 * Two correlations keep the outcome unambiguous (refine, mirrors P0.7):
 *  - `accepted ⇔ (validationResult !== 'rejected')` — the boolean and the outcome can't disagree
 *    (`accepted`/`repaired` are accepted; `rejected` is not).
 *  - `rejection` is present IFF `validationResult === 'rejected'` — a rejection is always explained,
 *    and a non-rejected response cannot carry a (nonsensical) rejection.
 *
 * Carries NO credential field (KEY SAFETY RULE #4 / §14), unrepresentable by `strictObject`.
 */
export const ModelGatewayResponse = z
  .strictObject({
    accepted: z.boolean(),
    output: z.unknown().optional(),
    validationResult: ValidationResult,
    providerMeta: ProviderMeta,
    langfuseTraceId: z.string().min(1).optional(),
    rejection: z.strictObject({ reason: z.string().min(1) }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.accepted !== (value.validationResult !== 'rejected')) {
      ctx.addIssue({
        code: 'custom',
        message: '`accepted` must equal (validationResult !== "rejected")',
        path: ['accepted'],
      });
    }
    const isRejected = value.validationResult === 'rejected';
    if (isRejected && value.rejection === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'a rejected response must carry a `rejection`',
        path: ['rejection'],
      });
    }
    if (!isRejected && value.rejection !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: '`rejection` is only valid on a rejected response',
        path: ['rejection'],
      });
    }
  });

export type ModelGatewayResponse = z.infer<typeof ModelGatewayResponse>;
