import type { ZodType } from 'zod';
import { CRITIC_INPUT_SENTINEL } from '@doppl/contracts';
import type { ModelGatewayRequest, ProviderCapability, ProviderMeta } from '@doppl/contracts';
import type { ModelGateway } from '../port';
import type { ProviderResult } from '../structured-output';
import { createGateway } from '../gateway';
import {
  ROLE_FIXTURES,
  STUB_PROBE_INVALID_OUTPUT,
  STUB_PROBE_SCHEMA,
  STUB_PROBE_VALID_OUTPUT,
} from './fixtures';

/**
 * Recorded/fake ModelGateway (P2.9) — completes the gateway chain (P2.1 -> P2.4 -> P2.9).
 *
 * Built by feeding a deterministic fake `providerCall` + `capabilityFor` into the REAL `createGateway`
 * (P2.4), so the stub exercises the genuine validate/repair/reject discipline with canned outputs —
 * it cannot drift from production behaviour. Deterministic/replayable (no `Date.now`/`Math.random`),
 * no live providers, no vendor SDK (rule #9), no energy representation (rule #8).
 */

export type FakeMode = 'valid' | 'repairable' | 'reject';

export interface FakeGatewayConfig {
  mode?: FakeMode;
}

export interface GatewaySelection {
  useStub: boolean;
  fake?: FakeGatewayConfig;
}

// Fixed stub call metadata: providerMeta is carried on every response; `ModelGatewayResponse` has no
// energy field, so the no-energy property (rule #8) is structural.
const STUB_PROVIDER_META: ProviderMeta = {
  provider: 'stub',
  modelId: 'stub-model',
  gatewayRequestId: 'stub-request',
  tokensIn: 0,
  tokensOut: 0,
};

const STUB_CAPABILITY: ProviderCapability = { structuredOutputs: true, embeddings: true };

/**
 * Detect the discipline's repair call WITHOUT cross-call state: the repair request always carries the
 * invalid output sentinel-wrapped with the frozen `CRITIC_INPUT_SENTINEL` (§23 / rule #5), which an
 * initial request never does. Stateless detection keeps two gateway instances byte-identical.
 */
function isRepairCall(request: ModelGatewayRequest): boolean {
  return (request.messages ?? []).some((message) =>
    message.content.includes(CRITIC_INPUT_SENTINEL),
  );
}

export function createFakeGateway(config: FakeGatewayConfig = {}): ModelGateway {
  const mode: FakeMode = config.mode ?? 'valid';

  const resolveSchema = (request: ModelGatewayRequest): ZodType | undefined =>
    mode === 'valid' ? ROLE_FIXTURES[request.role].schema : STUB_PROBE_SCHEMA;

  const providerCall = (request: ModelGatewayRequest): Promise<ProviderResult> => {
    let output: unknown;
    if (mode === 'valid') {
      output = ROLE_FIXTURES[request.role].output;
    } else if (mode === 'repairable') {
      // Initial call → invalid; the discipline's single (sentinel-wrapped) repair → valid.
      output = isRepairCall(request) ? STUB_PROBE_VALID_OUTPUT : STUB_PROBE_INVALID_OUTPUT;
    } else {
      output = STUB_PROBE_INVALID_OUTPUT; // reject: stays invalid through the single repair
    }
    return Promise.resolve({ output, providerMeta: STUB_PROVIDER_META });
  };

  return createGateway({ providerCall, capabilityFor: () => STUB_CAPABILITY, resolveSchema });
}

/**
 * Thin selection seam: return the fake when `useStub`. Reads NO env/file — resolving `useStub` from
 * defaults<file<env is the boot caller's job via `validateRunConfig` (lesson §4 IO-at-boundary; the
 * validateRunConfig carry-forward). The real provider-backed gateway lands in P2.5; until then
 * `useStub:false` is unsupported. Full registry-based selection wires in P2.2.
 */
export function selectGateway(selection: GatewaySelection): ModelGateway {
  if (selection.useStub) {
    return createFakeGateway(selection.fake);
  }
  throw new Error('real ModelGateway is not yet available — wire the OpenRouter adapter (P2.5)');
}
