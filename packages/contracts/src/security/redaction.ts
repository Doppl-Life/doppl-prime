/**
 * Secret-redaction scrub at the persistence boundary (ARCHITECTURE.md §14, KEY SAFETY RULE #4).
 *
 * One pure function: the event-store runs it before every `run_events` append, and observability
 * runs it before every Langfuse emit (wiring lands downstream). Its output IS the persisted truth,
 * so it must (a) never leak a covered secret (REQ-S-004 / RISK-006-009) and (b) never corrupt
 * legitimate text via a false positive.
 *
 * Defense in depth: value-pattern matching catches recognizable provider keys / Authorization
 * credentials anywhere in a string; a sensitive key-name redacts its ENTIRE value regardless of
 * type. Idempotent, structure-preserving, non-mutating (returns a deep copy).
 */

/** Stable token every redacted position holds. Matches no secret pattern, so re-scrub is a no-op. */
export const REDACTION_PLACEHOLDER = '[REDACTED]';

/**
 * Provider-key + Authorization-credential value patterns. Word-boundary anchored and length-gated
 * so dictionary words (`risk-`, `task-`, `disk-`) and prose ("Bearer of bad news") are never
 * corrupted — real keys/credentials run 20+ chars. Applied as substring replacements so any
 * surrounding non-secret text is preserved.
 */
const VALUE_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g, // OpenAI / OpenRouter (sk-or-) / Anthropic (sk-ant-) key families
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi, // Authorization: Bearer <token> (scheme is case-insensitive)
  /\bBasic\s+[A-Za-z0-9+/=]{16,}/gi, // Authorization: Basic <base64> (scheme is case-insensitive)
];

/**
 * Key-names whose value is redacted whole regardless of format (case-insensitive contains-match).
 * Err toward over-redaction: a false-positive redaction is safe; a missed secret is not.
 */
const SENSITIVE_KEY_FRAGMENTS: readonly string[] = [
  'authorization',
  'api_key',
  'apikey',
  'secret',
  'token',
  'access_token',
  'client_secret',
  'password',
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

function redactPatterns(input: string): string {
  let output = input;
  for (const pattern of VALUE_PATTERNS) {
    output = output.replace(pattern, REDACTION_PLACEHOLDER);
  }
  return output;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactPatterns(value);
  }
  if (Array.isArray(value)) {
    return value.map((element) => scrubValue(element));
  }
  if (value !== null && typeof value === 'object') {
    // Rebuild on a normal-prototype object; assign every property via Object.defineProperty so an
    // arbitrary payload key named `__proto__`/`constructor` round-trips as own DATA (no silent
    // loss, no prototype pollution) while the output stays a plain object for downstream code.
    const result: Record<string, unknown> = {};
    const usedKeys = new Set<string>();
    // Per-base resume cursor so the de-collision search is O(1) amortized (not O(n²) rescan-from-2)
    // — the scrub runs on the append-critical path, so a payload with many colliding keys must not
    // stall the kernel.
    const nextSuffix = new Map<string, number>();
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      // A provider key / credential used AS a key must not leak verbatim — scrub the key too. When
      // two distinct secret-form keys redact to the same token, de-collide (`#2`, `#3`, …) so
      // neither value is silently dropped from the append-only truth.
      const base = redactPatterns(key);
      let outKey = base;
      if (usedKeys.has(outKey)) {
        let n = nextSuffix.get(base) ?? 2;
        while (usedKeys.has(`${base}#${n}`)) n++;
        outKey = `${base}#${n}`;
        nextSuffix.set(base, n + 1);
      }
      usedKeys.add(outKey);
      Object.defineProperty(result, outKey, {
        value: isSensitiveKey(key) ? REDACTION_PLACEHOLDER : scrubValue(child),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  }
  // number, boolean, null, undefined, bigint — non-string leaves pass through (a key is a string).
  return value;
}

/**
 * Return a structure-preserving deep copy of `payload` with provider keys, Authorization
 * credentials, and values under sensitive key-names redacted to {@link REDACTION_PLACEHOLDER}.
 *
 * Pure (never mutates `payload`) and idempotent: `scrubSecrets(scrubSecrets(x))` deep-equals
 * `scrubSecrets(x)`.
 *
 * Input MUST be a JSON-plain value (the real path is a Zod-validated `z.record` payload). Non-plain
 * objects (Date, Map, Set, class instances) are not specially handled and their contents are not
 * preserved — scrub the JSON-serializable form.
 */
export function scrubSecrets(payload: unknown): unknown {
  return scrubValue(payload);
}
