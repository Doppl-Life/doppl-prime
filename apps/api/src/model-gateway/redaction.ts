import { redact } from "@doppl/contracts";

/**
 * Two-boundary redaction helpers per ARCHITECTURE.md §14 and
 * IMPLEMENTATION_PLAN.md P2.3. The same `redact()` from `@doppl/contracts`
 * (frozen in Phase 0 U5) runs at:
 *  - the persistence boundary — Phase 1 U5 already calls redact() inside
 *    appendEvent. The persistedEventPayload helper here is a no-op pass-
 *    through that makes the gateway-side intent explicit at code review.
 *  - the Langfuse-emit boundary — Cloud mode metadata flows through
 *    langfuseMetadata before reaching the SDK. Without this, a stray
 *    `apiKey` field in metadata could leak to the side channel even
 *    though it never reaches Postgres.
 *
 * The structural grep tests in this unit's __tests__ assert these two
 * helpers are the only entry points to their boundaries.
 */

export function persistedEventPayload<T>(payload: T): T {
  return redact(payload) as T;
}

export function langfuseMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return redact(metadata) as Record<string, unknown>;
}
