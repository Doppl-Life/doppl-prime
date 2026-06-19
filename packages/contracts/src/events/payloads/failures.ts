import { z } from "zod";

/**
 * Failure / terminal event payloads. Each carries a `reason` string plus
 * the minimal context needed to reconstruct the failure on replay.
 */

export const ProviderCallFailedPayload = z
  .object({
    reason: z.string().min(1),
    routeId: z.string().optional(),
    retryable: z.boolean().optional(),
  })
  .strict();

export const OutputSchemaRejectedPayload = z
  .object({
    reason: z.string().min(1),
    validationError: z.string().optional(),
    role: z.string().optional(),
  })
  .strict();

export const CandidateInvalidatedPayload = z
  .object({
    candidateId: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export const EnergyExhaustedPayload = z
  .object({
    reason: z.string().min(1),
    spent: z.number().int().nonnegative(),
    budget: z.number().int().nonnegative(),
  })
  .strict();

export const GenerationFailedPayload = z
  .object({
    reason: z.string().min(1),
    failedState: z.string().optional(),
  })
  .strict();

export const ReproductionAbortedInsufficientParentsPayload = z
  .object({
    reason: z.string().min(1),
    parentCount: z.number().int().nonnegative(),
  })
  .strict();

export const NoveltyScoringDegradedPayload = z
  .object({
    reason: z.string().min(1),
    fallbackMethod: z.string().min(1),
  })
  .strict();
