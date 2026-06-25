import type { ZodType } from 'zod';
import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
  ModelRole,
  ProviderCapability,
  ProviderMeta,
} from '@doppl/contracts';
import type { ModelGateway } from './port';
import { applyStructuredOutputDiscipline } from './structured-output';
import type { ProviderCallFn } from './structured-output';
import type { AttemptFailure } from './adapters/retry';

/**
 * Thrown by a provider adapter's `providerCall` when a model call terminally fails (bounded retries +
 * one fallback all exhausted). It is the failure counterpart of `ProviderResult`: `createGateway`
 * catches it (below) and maps it to a rejected `ModelGatewayResponse`, so the §6 port contract holds —
 * domain code calling `ModelGateway.call()` only ever receives a `ModelGatewayResponse`, never a throw.
 * Carries per-attempt `{attempt,reason}` info + a route-derived `providerMeta` (zero tokens — rule #8,
 * no energy on a failed call). Defined here, co-located with its catcher; adapters import + throw it.
 */
export class ProviderCallError extends Error {
  constructor(
    public readonly failures: ReadonlyArray<AttemptFailure>,
    public readonly providerMeta: ProviderMeta,
  ) {
    super(`provider call failed after ${failures.length} attempt(s)`);
    this.name = 'ProviderCallError';
  }
}

function summarizeFailures(failures: ReadonlyArray<AttemptFailure>): string {
  if (failures.length === 0) return 'provider call failed';
  return failures.map((failure) => `attempt ${failure.attempt}: ${failure.reason}`).join('; ');
}

/**
 * Minimal gateway shell (P2.4): composes the `ModelGateway` port (P2.1) with the structured-output
 * discipline around an INJECTED provider-call function, so the discipline is reachable + testable now.
 * The capability registry (P2.2) and the real OpenRouter adapter (P2.5) inject the real
 * provider-call + capability resolver later; the first production consumer is the P3 runtime loop.
 */
export interface GatewayDeps {
  /** Performs one model interaction; gateway uses it for the initial call AND the (<=1) repair. */
  providerCall: ProviderCallFn;
  /** Per-role capability lookup (registry-backed in P2.2). */
  capabilityFor: (role: ModelRole) => ProviderCapability;
  /** Narrows the opaque `request.schema` (z.unknown()) to a ZodType; defaults to a duck-typed check. */
  resolveSchema?: (request: ModelGatewayRequest) => ZodType | undefined;
}

function hasSafeParse(value: unknown): value is ZodType {
  return (
    typeof value === 'object' &&
    value !== null &&
    'safeParse' in value &&
    typeof (value as { safeParse: unknown }).safeParse === 'function'
  );
}

function defaultResolveSchema(request: ModelGatewayRequest): ZodType | undefined {
  return hasSafeParse(request.schema) ? request.schema : undefined;
}

export function createGateway(deps: GatewayDeps): ModelGateway {
  const resolveSchema = deps.resolveSchema ?? defaultResolveSchema;
  return {
    async call(request: ModelGatewayRequest): Promise<ModelGatewayResponse> {
      try {
        const schema = resolveSchema(request);
        const initial = await deps.providerCall(request);
        // TU.4 — a tool-call turn: the provider asked to call tools (`finish_reason==='tool_calls'`), so
        // there is NO final answer to validate yet. Surface the requests WITHOUT running the discipline; the
        // tool-orchestrating gateway executes the tools, re-injects results, and re-asks. (rule #6: only the
        // population_generator route ever sends tools → only it can reach this branch; critic/judge are
        // byte-identical.) `accepted ⇔ result≠rejected` holds (accepted/'accepted', no rejection).
        if (initial.toolCallRequests && initial.toolCallRequests.length > 0) {
          return {
            accepted: true,
            validationResult: 'accepted',
            providerMeta: initial.providerMeta,
            toolCallRequests: [...initial.toolCallRequests],
          };
        }
        // No structured-output schema → nothing to validate; accept the raw provider output as-is.
        if (!schema) {
          return {
            accepted: true,
            validationResult: 'accepted',
            output: initial.output,
            providerMeta: initial.providerMeta,
          };
        }
        // `await` so a terminal failure of the discipline's (≤1) repair providerCall is caught here too.
        return await applyStructuredOutputDiscipline({
          request,
          schema,
          rawOutput: initial.output,
          providerMeta: initial.providerMeta,
          repair: deps.providerCall,
        });
      } catch (error) {
        // Port contract: a terminal provider failure FAILS THE CALL, not the run — map it to a rejected
        // response carrying providerMeta (no energy representation, rule #8). Re-throw anything else: a
        // non-provider error is a real bug, never silently swallowed as a rejection.
        if (error instanceof ProviderCallError) {
          return {
            accepted: false,
            validationResult: 'rejected',
            providerMeta: error.providerMeta,
            rejection: { reason: summarizeFailures(error.failures) },
          };
        }
        throw error;
      }
    },
    capabilityFor(role: ModelRole): ProviderCapability {
      return deps.capabilityFor(role);
    },
  };
}
