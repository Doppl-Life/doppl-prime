import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
  ModelRole,
  ProviderCapability,
} from '@doppl/contracts';

/**
 * ModelGateway — the single provider seam domain/runtime code depends on (ARCHITECTURE.md §6).
 *
 * Type-only: the I/O are exactly the frozen §6 wire contracts, so no vendor SDK type ever leaks into
 * domain/runtime modules (KEY SAFETY RULE #9 / forbidden-pattern #2). The port carries no credential
 * field and no way to pass a provider key through it — keys load from env only (KEY SAFETY RULE #4),
 * already unrepresentable in the frozen `ModelGatewayRequest`/`ModelGatewayResponse`.
 *
 * First implementation: the recorded/fake stub (P2.9) + the OpenRouter adapter (P2.5).
 * First consumer: the runtime generation loop (P3).
 */
export interface ModelGateway {
  /** Route one model call (role-in-request); resolves the validated structured-output response. */
  call(request: ModelGatewayRequest): Promise<ModelGatewayResponse>;

  /** The capability matrix for a role, so domain code branches on capability flags, never a provider. */
  capabilityFor(role: ModelRole): ProviderCapability;
}
