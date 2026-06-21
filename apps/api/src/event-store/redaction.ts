import { REDACTION_PLACEHOLDER, scrubSecrets } from '@doppl/contracts';

/**
 * Event-store secret-redaction scrub at the persistence write boundary (KEY SAFETY RULE #4, §14).
 *
 * The append-only writer (P1.3) runs this on every payload BEFORE insert, so its output IS the
 * persisted truth: it must never leak a covered secret (RISK-006/009) and never corrupt legitimate
 * prose (a false positive is permanent in the append-only log).
 *
 * It COMPOSES the frozen `@doppl/contracts` `scrubSecrets` (key-format + key-name + secret-key layers,
 * never reimplemented — LESSONS 5) and adds the env-value layer (human-ratified Option A): any payload
 * string containing a loaded `process.env` secret VALUE is redacted, catching secrets that match no
 * key-format pattern and sit under no sensitive key-name (a DB password, an over-persisted raw output).
 *
 * Pure (reads no `process.env` — secret values are injected, LESSONS 4), deep, idempotent,
 * structure-preserving, non-mutating (returns a deep copy).
 */

/**
 * Minimum length a candidate secret value must have to be substring-matched by the env-value layer.
 * Below this a blank or 1–2-char value (a missing/short env var) would over-redact catastrophically —
 * `''.includes` matches everywhere. Real provider keys / DB credentials run far longer.
 */
const MIN_SECRET_LENGTH = 8;

/**
 * Keep only secret values that are safe to substring-match: non-blank, length-gated, and never a
 * substring of the placeholder — so re-scrub stays a no-op (idempotency) even for a contrived
 * `REDACTED`-like value, and a blank/short env var can never blanket-redact the payload.
 */
function usableSecrets(secretValues: readonly string[]): string[] {
  return secretValues.filter(
    (secret) =>
      typeof secret === 'string' &&
      secret.length >= MIN_SECRET_LENGTH &&
      !REDACTION_PLACEHOLDER.includes(secret),
  );
}

/** Replace every occurrence of each secret value (literal substring, no regex) with the placeholder. */
function redactSecretsInString(input: string, secrets: readonly string[]): string {
  let output = input;
  for (const secret of secrets) {
    output = output.split(secret).join(REDACTION_PLACEHOLDER);
  }
  return output;
}

/**
 * Deep env-value pass over string VALUES, array elements, AND object KEYS. Keys must be scrubbed too:
 * `RunEventEnvelope.payload` is an open `z.record(z.string(), z.unknown())` and 30/36 event types fall
 * to the same generic open-key schema, so producer-controlled strings reach KEY positions on the real
 * append path — and a non-format secret used as a key is exactly the class the env-value layer is the
 * sole defense for (the frozen scrub only catches key-FORMAT secrets + sensitive key-NAMES in keys).
 *
 * Key redaction carries DE-COLLISION (`[REDACTED]`, `[REDACTED]#2`, …, resume-cursor so it stays O(1)
 * amortized) — mirroring the frozen `scrubSecrets` pattern in apps/api (the contract is immutable) so
 * two distinct secret keys redacting alike don't collapse and silently drop a value (LESSONS 3).
 *
 * Rebuilds on a normal-prototype object via `Object.defineProperty` so a payload key named
 * `__proto__`/`constructor` round-trips as own DATA (mirrors the frozen scrub; no prototype pollution).
 */
function redactEnvValues(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') {
    return redactSecretsInString(value, secrets);
  }
  if (Array.isArray(value)) {
    return value.map((element) => redactEnvValues(element, secrets));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    const usedKeys = new Set<string>();
    const nextSuffix = new Map<string, number>();
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const base = redactSecretsInString(key, secrets);
      let outKey = base;
      if (usedKeys.has(outKey)) {
        let n = nextSuffix.get(base) ?? 2;
        while (usedKeys.has(`${base}#${n}`)) n++;
        outKey = `${base}#${n}`;
        nextSuffix.set(base, n + 1);
      }
      usedKeys.add(outKey);
      Object.defineProperty(result, outKey, {
        value: redactEnvValues(child, secrets),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  }
  return value;
}

/**
 * Return a structure-preserving deep copy of `payload` with provider keys, Authorization credentials,
 * values under sensitive key-names (frozen scrub), AND any string containing a loaded secret value
 * (env-value layer) redacted to {@link REDACTION_PLACEHOLDER}.
 *
 * With `secretValues` empty (or all filtered) the result is exactly `scrubSecrets(payload)`.
 */
export function scrubEventPayload(payload: unknown, secretValues: readonly string[]): unknown {
  const frozen = scrubSecrets(payload);
  const secrets = usableSecrets(secretValues);
  if (secrets.length === 0) {
    return frozen;
  }
  return redactEnvValues(frozen, secrets);
}
