/**
 * Secret-redaction scrub.
 *
 * Pure, idempotent. Used at BOTH the Postgres-append boundary AND the
 * Langfuse-emit boundary (one scrub, two callsites — ARCHITECTURE.md §14).
 * Safety invariant: no secret substring may appear in any output of redact()
 * (REQ-S-004 / RISK-006 / RISK-009).
 *
 * The scrub combines two strategies:
 *   1. **String pattern match.** Strings are scanned for common secret
 *      shapes (sk-..., Bearer ..., env-style API_KEY assignments, generic
 *      apiKey/secret/token=value). A whole-string match collapses to the
 *      placeholder; an in-string match replaces the matched substring.
 *   2. **Key-name heuristic.** Object values whose key matches a known
 *      secret-name (apiKey, authorization, token, ...) are replaced
 *      wholesale, even if the value would not pattern-match.
 */

export const REDACTION_PLACEHOLDER = "[REDACTED]" as const;

const SECRET_KEY_NAMES = new Set([
  "apikey",
  "api_key",
  "authorization",
  "secret",
  "token",
  "password",
]);

// Order matters: more specific patterns first. Each pattern is global so
// String.replace() walks every occurrence.
const STRING_PATTERNS: RegExp[] = [
  // OPENAI/OPENROUTER/ANTHROPIC_API_KEY=value
  /(OPENAI|OPENROUTER|ANTHROPIC)_API_KEY\s*=\s*\S+/gi,
  // OpenAI-style keys: sk- followed by 20+ url-safe chars
  /sk-[A-Za-z0-9_-]{20,}/g,
  // OpenRouter-style: or- followed by 20+ chars
  /or-[A-Za-z0-9_-]{20,}/g,
  // Bearer tokens in auth headers
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  // Generic key/secret/token = value
  /(api[_-]?key|secret|token|password)\s*[:=]\s*\S+/gi,
];

function redactString(input: string): string {
  if (input.length === 0) return input;
  let out = input;
  for (const pattern of STRING_PATTERNS) {
    out = out.replace(pattern, REDACTION_PLACEHOLDER);
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint" || typeof value === "symbol") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (SECRET_KEY_NAMES.has(key.toLowerCase())) {
        out[key] = REDACTION_PLACEHOLDER;
      } else {
        out[key] = redact(child);
      }
    }
    return out;
  }
  // Class instances, Date, Map, Set, etc. — preserve as-is. Doppl event
  // payloads are JSONB-shaped per ARCHITECTURE.md §4, so these are not
  // expected; passing them through is the safe default.
  return value;
}
