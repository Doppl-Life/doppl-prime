import type { ZodType } from 'zod';

/**
 * A schema-validation failure at the data boundary — a TYPED error, never a raw Zod throw, so an
 * unvalidated/malformed server payload can never corrupt view state (ARCHITECTURE.md §12, safety
 * rule #9). Carries the `endpoint` it came from and the Zod `issues` for diagnostics; the run stays
 * inspectable via the REST projections after one bad payload.
 */
export class PayloadValidationError extends Error {
  readonly kind = 'payload_validation_error' as const;
  readonly endpoint: string;
  readonly issues: unknown;

  constructor(endpoint: string, issues: unknown) {
    super(`Invalid payload from ${endpoint}`);
    this.name = 'PayloadValidationError';
    this.endpoint = endpoint;
    this.issues = issues;
  }
}

/**
 * A non-2xx HTTP response from a projection/command endpoint — a distinct TYPED error so a
 * transport/auth failure is never mislabeled as a payload-validation failure, and an error body that
 * happens to satisfy a contract schema (e.g. `[]` from a 404 on a list endpoint) can never be
 * false-accepted as a valid projection (ARCHITECTURE.md §11). The run stays inspectable; the caller
 * can retry/resync.
 */
export class TransportError extends Error {
  readonly kind = 'transport_error' as const;
  readonly endpoint: string;
  readonly status: number;

  constructor(endpoint: string, status: number) {
    super(`Request to ${endpoint} failed with status ${status}`);
    this.name = 'TransportError';
    this.endpoint = endpoint;
    this.status = status;
  }
}

/**
 * Parse `data` through `schema`, returning the typed value; a validation failure becomes a
 * `PayloadValidationError` tagged with `endpoint` (never a raw throw). The single validate-at-
 * boundary helper shared by the REST client and the SSE stream.
 */
export function parseOrThrow<T>(schema: ZodType<T>, endpoint: string, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new PayloadValidationError(endpoint, result.error.issues);
  }
  return result.data;
}
