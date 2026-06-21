/**
 * @doppl/observability — the non-authoritative observability side channel (ARCHITECTURE.md §13/§14).
 * Exposes the Langfuse-emit-boundary secret scrub (`scrubObservabilityPayload`, the twin of the
 * event-store `scrubEventPayload`, KEY SAFETY RULE #4) and the before-emit boundary
 * (`createEmitBoundary`) that scrubs every payload before the injected emitter and fails safe on a
 * failed export. No model/web/DB dependency — observability never writes the authoritative log.
 */
export * from './redaction';
export * from './emit';
