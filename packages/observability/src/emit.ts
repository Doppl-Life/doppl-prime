import { enforcePayloadCeiling } from '@doppl/contracts';
import { scrubObservabilityPayload } from './redaction';

/**
 * The before-emit boundary (KEY SAFETY RULE #4, §14 / §13). Every payload first passes the frozen
 * payload-DoS ceiling (depth ≤32 / size ≤1 MiB, §26 parity with the event-store append path) — the
 * scrub recurses, so an unbounded/deeply-nested payload is dropped BEFORE it can blow the stack — then
 * is scrubbed BEFORE the injected emitter is called, so an unscrubbed secret can never reach an
 * external sink (rule #4). The boundary FAILS SAFE: a ceiling-exceeded payload OR an emitter that
 * throws is dropped with a local-only warning, and nothing is written to the authoritative log —
 * Langfuse is non-authoritative, so a tracing outage (or a pathological trace) must never crash the
 * run (§13).
 *
 * The emitter is INJECTED (LESSONS 24 — run the real scrub + fail-safe discipline, inject the IO);
 * P2.8 (kernel Langfuse adapter) passes the real client and MUST import this scrub, never reimplement
 * it (the §14 "a single scrub function"). This module imports nothing from the event store / DB, so it
 * is structurally incapable of touching the authoritative log.
 */

/** The injected external sink — P2.8 passes the real Langfuse client's export call. Sync or async. */
export type ObservabilityEmitter = (payload: unknown) => void | Promise<void>;

/** Local-only warning sink on a failed export — NOT the authoritative log (§13). Defaults to console. */
export type LocalWarn = (message: string, error: unknown) => void;

export interface EmitBoundaryDeps {
  /** Loaded `process.env` secret values, injected at boot (IO at the boundary, LESSONS 4). */
  secretValues: readonly string[];
  /** The injected emitter (P2.8 real Langfuse client). */
  emit: ObservabilityEmitter;
  /** Local-only warning on a failed export (Langfuse non-authoritative, §13). Defaults to console. */
  warn?: LocalWarn;
}

export interface EmitBoundary {
  /** Scrub the payload, then emit it; a failed export is swallowed with a local warning (§13). */
  emit(payload: unknown): Promise<void>;
}

const defaultWarn: LocalWarn = (message, error) => {
  console.warn(`[observability] ${message}`, error);
};

/**
 * Build the before-emit boundary. `secretValues` feed the scrub (redaction match-targets — never
 * threaded into the emitted object); `emit` is the injected sink; `warn` is the local-only failure
 * channel.
 */
export function createEmitBoundary({
  secretValues,
  emit,
  warn = defaultWarn,
}: EmitBoundaryDeps): EmitBoundary {
  return {
    async emit(payload: unknown): Promise<void> {
      // §26 parity / §13 — bound depth+size BEFORE the recursive scrub (the frozen ceiling's depth
      // probe is iterative + bounded, so it can never stack-overflow on a pathological payload). On
      // exceed, DROP the non-authoritative trace with a local-only warning — never recurse on it,
      // never write the authoritative log.
      const ceiling = enforcePayloadCeiling(payload);
      if (!ceiling.ok) {
        warn(
          `langfuse trace exceeds payload ceiling (${ceiling.violation}); dropped`,
          ceiling.violation,
        );
        return;
      }
      // rule #4 / §14 — scrub BEFORE the payload leaves the process; an unscrubbed payload cannot
      // reach the emitter.
      const scrubbed = scrubObservabilityPayload(payload, secretValues);
      try {
        await emit(scrubbed);
      } catch (error) {
        // §13 — fail safe: swallow the export failure, log a local-only warning, write NO entry to the
        // authoritative log. A tracing outage must never crash the run.
        warn('langfuse export failed; trace dropped (non-authoritative)', error);
      }
    },
  };
}
