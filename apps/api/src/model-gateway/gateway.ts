import type { ZodType } from 'zod';
import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
  ModelRole,
  ProviderCapability,
} from '@doppl/contracts';
import type { ModelGateway } from './port';
import { applyStructuredOutputDiscipline } from './structured-output';
import type { ProviderCallFn } from './structured-output';

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
      const schema = resolveSchema(request);
      const initial = await deps.providerCall(request);
      // No structured-output schema → nothing to validate; accept the raw provider output as-is.
      if (!schema) {
        return {
          accepted: true,
          validationResult: 'accepted',
          output: initial.output,
          providerMeta: initial.providerMeta,
        };
      }
      return applyStructuredOutputDiscipline({
        request,
        schema,
        rawOutput: initial.output,
        providerMeta: initial.providerMeta,
        repair: deps.providerCall,
      });
    },
    capabilityFor(role: ModelRole): ProviderCapability {
      return deps.capabilityFor(role);
    },
  };
}
