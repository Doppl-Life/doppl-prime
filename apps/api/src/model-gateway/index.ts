/**
 * model-gateway — the internal provider-seam surface for apps/api. Runtime/verifier import the
 * `ModelGateway` port + the frozen §6 wire contracts from HERE (one internal seam-import surface);
 * `@doppl/contracts` remains the sole definition source — nothing is redefined here (lesson §5).
 *
 * Backend-internal: deliberately NOT re-exported from the package public barrel (`src/index.ts`).
 */
export type { ModelGateway } from './port';
export {
  ModelGatewayRequest,
  ModelGatewayResponse,
  ModelRole,
  ProviderCapability,
  ModelRoute,
} from '@doppl/contracts';

// Structured-output discipline + gateway shell (P2.4) — the seam grows; @doppl/contracts stays the
// sole definition source for the wire contracts above.
export { createGateway } from './gateway';
export type { GatewayDeps } from './gateway';
export { applyStructuredOutputDiscipline } from './structured-output';
export type { ProviderCallFn, ProviderResult, StructuredOutputParams } from './structured-output';

// Recorded/fake gateway (P2.9) — the freeze-bundle fork artifact dependent tracks + P3 integration
// tests run against; completes the gateway chain.
export { createFakeGateway, selectGateway } from './stub/fake-gateway';
export type { FakeGatewayConfig, FakeMode, GatewaySelection } from './stub/fake-gateway';
