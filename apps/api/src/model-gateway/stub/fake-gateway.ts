import type { ZodType } from 'zod';
import { CRITIC_INPUT_SENTINEL } from '@doppl/contracts';
import type { ModelGatewayRequest, ProviderCapability, ProviderMeta } from '@doppl/contracts';
import type { ModelGateway } from '../port';
import type { ProviderResult } from '../structured-output';
import { createGateway } from '../gateway';
import { createLiveGateway, type LiveGatewayDeps } from '../live-gateway';
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
 * Thin recorded-vs-live multiplexer (PD.9). Reads NO env/file — resolving `useStub` from
 * defaults<file<env is the boot caller's job (lesson §4 IO-at-boundary; the validateRunConfig
 * carry-forward), and the live `liveDeps` (registry + provider client) are built at the boot boundary
 * (`main.ts`) only when `DOPPL_GATEWAY=live`:
 *   - `useStub:true`  → the deterministic recorded fake (unchanged).
 *   - `useStub:false` + `liveDeps` → the real OpenRouter-backed gateway (`createLiveGateway`).
 *   - `useStub:false` with NO `liveDeps` → an HONEST throw. We never silently fall back to the fake: a
 *     missing live config is a boot misconfiguration to surface, not to mask as a passing recorded run.
 */
export function selectGateway(selection: GatewaySelection, liveDeps?: LiveGatewayDeps): ModelGateway {
  if (selection.useStub) {
    return createFakeGateway(selection.fake);
  }
  if (liveDeps === undefined) {
    throw new Error(
      'live ModelGateway requires liveDeps {registry, client} (DOPPL_GATEWAY=live) — none supplied; ' +
        'refusing to silently fall back to the recorded fake',
    );
  }
  return createLiveGateway(liveDeps);
}
