import { z } from "zod";
import { ModelRole } from "./model-role.js";

/**
 * Model-gateway wire contracts (ARCHITECTURE.md §9, IMPLEMENTATION_PLAN.md
 * P0.12). `input` and `schemaForOutput` are z.unknown() because the
 * gateway is provider-agnostic: provider adapters narrow these per their
 * own structured-output discipline (P2.4).
 *
 * Energy: `energyEstimate` is REQUIRED (pre-call estimate); `energyActual`
 * is optional because post-call reconciliation may not have happened yet
 * when a response is constructed (P3.5).
 */
export const ModelGatewayRequest = z
  .object({
    role: ModelRole,
    runId: z.string().min(1),
    generationId: z.string().min(1).optional(),
    agenomeId: z.string().min(1).optional(),
    candidateId: z.string().min(1).optional(),
    input: z.unknown(),
    schemaForOutput: z.unknown().optional(),
    timeoutMs: z.number().int().positive().optional(),
    correlationId: z.string().min(1),
  })
  .strict();
export type ModelGatewayRequest = z.infer<typeof ModelGatewayRequest>;

export const ModelGatewayResponse = z
  .object({
    ok: z.boolean(),
    output: z.unknown().optional(),
    repairAttempts: z.number().int().nonnegative(),
    validationError: z.string().optional(),
    providerTraceId: z.string().min(1).optional(),
    langfuseObservationId: z.string().min(1).optional(),
    energyEstimate: z.number().int().nonnegative(),
    energyActual: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ModelGatewayResponse = z.infer<typeof ModelGatewayResponse>;
