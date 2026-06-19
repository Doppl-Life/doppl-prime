import { randomUUID } from "node:crypto";
import type { ModelGatewayRequest, ModelGatewayResponse, ModelRoute } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../event-store/append.js";
import type { GatewayRegistry } from "./default-routes.js";
import { GatewayConfigError, RetryExhaustedError, type RouteNotFoundError } from "./errors.js";

/**
 * Adapter contract — the lowest-level provider interface. Adapters are
 * injected by the caller; the dispatcher only knows about this shape.
 */
export interface Adapter {
  invoke(route: ModelRoute, request: ModelGatewayRequest): Promise<AdapterResult>;
}

/**
 * Adapter return shape. `rawOutput` is the provider's response (chat
 * content, embedding vector, retrieval results). `energyEstimate` and
 * `energyActual` are doppl_energy units (Phase 3 tunes the heuristic).
 */
export interface AdapterResult {
  rawOutput: unknown;
  energyEstimate: number;
  energyActual: number;
  providerTraceId?: string;
}

/**
 * Langfuse trace handle returned by `langfuse.startTrace`. The gateway
 * doesn't care whether it's a Cloud span or a local-trace fallback; the
 * IDs flow back to the caller either way (and into the persisted event).
 */
export interface TraceHandle {
  traceId: string;
  observationId: string;
  end(result: { tokensUsed?: number; success: boolean; error?: string }): Promise<void>;
}

/**
 * Gateway-level Langfuse interface. U8 provides the concrete
 * implementation (Cloud SDK + local-trace fallback).
 */
export interface GatewayLangfuse {
  startTrace(opts: {
    name: string;
    runId: string;
    correlationId: string;
    metadata?: Record<string, unknown>;
  }): TraceHandle;
}

/**
 * Event-store binding — the caller pre-binds the db handle. Mirrors the
 * Phase 1 `appendEvent(db, input)` shape with the db already curried.
 */
export interface GatewayEventStore {
  appendEvent(input: AppendEventInput): Promise<AppendEventResult>;
}

export interface GatewayDeps {
  registry: GatewayRegistry;
  adapterFor: (provider: string) => Adapter;
  eventStore: GatewayEventStore;
  langfuse: GatewayLangfuse;
}

/**
 * The single provider seam. Domain code holds a `ModelGateway` reference
 * — never a vendor SDK — and lets the dispatcher resolve routes, apply
 * structured-output discipline (U4), wire retry+fallback, and persist
 * energy/failure events. The dispatcher is pure orchestration; all I/O
 * lives in adapters.
 */
export interface ModelGateway {
  invoke(request: ModelGatewayRequest): Promise<ModelGatewayResponse>;
}

/**
 * Parse a fallbackRouteId string `<provider>:<modelId>` into a synthetic
 * ModelRoute that inherits role + capabilities from the primary. Used by
 * the dispatcher to call the fallback adapter on primary failure.
 */
function deriveFallbackRoute(primary: ModelRoute, fallbackId: string): ModelRoute {
  const idx = fallbackId.indexOf(":");
  if (idx <= 0 || idx === fallbackId.length - 1) {
    throw new GatewayConfigError(
      `Invalid fallbackRouteId "${fallbackId}" — expected "<provider>:<modelId>"`,
    );
  }
  return {
    role: primary.role,
    provider: fallbackId.slice(0, idx),
    modelId: fallbackId.slice(idx + 1),
    capabilities: primary.capabilities,
    fallbackRouteIds: [],
  };
}

function summarizeError(err: unknown): { reason: string; retryable: boolean } {
  if (err instanceof RetryExhaustedError) {
    return { reason: err.message, retryable: false };
  }
  if (err instanceof Error) {
    return { reason: err.message, retryable: false };
  }
  return { reason: String(err), retryable: false };
}

export function createGateway(deps: GatewayDeps): ModelGateway {
  return {
    async invoke(request) {
      // 1. Resolve route. Unknown role → RouteNotFoundError (re-thrown).
      const primaryRoute = deps.registry.resolveRoute(request.role);

      // 2. Start a Langfuse trace (or local-trace fallback).
      const trace = deps.langfuse.startTrace({
        name: `gateway.${request.role}`,
        runId: request.runId,
        correlationId: request.correlationId,
      });

      // 3. Try primary, then exactly one fallback if available.
      const attempts: { route: ModelRoute; isFallback: boolean }[] = [
        { route: primaryRoute, isFallback: false },
      ];
      const fallbackId = primaryRoute.fallbackRouteIds[0];
      if (fallbackId !== undefined) {
        attempts.push({
          route: deriveFallbackRoute(primaryRoute, fallbackId),
          isFallback: true,
        });
      }

      let lastError: unknown;
      for (const attempt of attempts) {
        const adapter = deps.adapterFor(attempt.route.provider);
        try {
          const result = await adapter.invoke(attempt.route, request);
          // Success path — emit energy.spent (success-only invariant).
          await deps.eventStore.appendEvent({
            runId: request.runId,
            type: "energy.spent",
            actor: "runtime",
            payload: {
              energy: {
                id: randomUUID(),
                runId: request.runId,
                ...(request.generationId !== undefined
                  ? { generationId: request.generationId }
                  : {}),
                ...(request.agenomeId !== undefined ? { agenomeId: request.agenomeId } : {}),
                eventType: attempt.route.provider === "retrieval" ? "tool" : "llm",
                estimate: result.energyEstimate,
                actual: result.energyActual,
                unit: "doppl_energy",
                reason: `gateway.${request.role}`,
                providerMeta: {
                  provider: attempt.route.provider,
                  modelId: attempt.route.modelId,
                  ...(result.providerTraceId ? { providerTraceId: result.providerTraceId } : {}),
                  isFallback: attempt.isFallback,
                },
              },
            },
            ...(request.generationId !== undefined ? { generationId: request.generationId } : {}),
            ...(request.agenomeId !== undefined ? { agenomeId: request.agenomeId } : {}),
            correlationId: request.correlationId,
            langfuseTraceId: trace.traceId,
            langfuseObservationId: trace.observationId,
          });
          await trace.end({
            success: true,
            tokensUsed: result.energyActual,
          });
          return {
            ok: true,
            output: result.rawOutput,
            repairAttempts: 0,
            providerTraceId: result.providerTraceId,
            langfuseObservationId: trace.observationId,
            energyEstimate: result.energyEstimate,
            energyActual: result.energyActual,
          };
        } catch (err) {
          lastError = err;
          const summary = summarizeError(err);
          await deps.eventStore.appendEvent({
            runId: request.runId,
            type: "provider_call_failed",
            actor: "runtime",
            payload: {
              reason: summary.reason,
              routeId: `${attempt.route.provider}:${attempt.route.modelId}`,
              retryable: summary.retryable,
            },
            ...(request.generationId !== undefined ? { generationId: request.generationId } : {}),
            ...(request.agenomeId !== undefined ? { agenomeId: request.agenomeId } : {}),
            correlationId: request.correlationId,
            langfuseTraceId: trace.traceId,
            langfuseObservationId: trace.observationId,
          });
          // Continue to the next attempt (fallback, if any).
        }
      }

      // All attempts exhausted.
      await trace.end({ success: false, error: summarizeError(lastError).reason });
      throw new RetryExhaustedError(attempts.length, lastError);
    },
  };
}
