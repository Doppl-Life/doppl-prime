import type { ModelGatewayRequest, ModelGatewayResponse } from "@doppl/contracts";

/**
 * The single provider seam every track depends on. Implementations must
 * satisfy `ARCHITECTURE.md §6` — domain/runtime code never imports a
 * vendor SDK directly. This type stays minimal so it's easy to satisfy
 * with a fake/recorded implementation for parallel-track development
 * (see `RecordedGateway` in U9).
 *
 * `createGateway(deps)` (U3) and `RecordedGateway` (U9) are the two
 * concrete shapes Phase 2 ships.
 */
export interface ModelGateway {
  invoke(request: ModelGatewayRequest): Promise<ModelGatewayResponse>;
}
