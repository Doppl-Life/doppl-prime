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
