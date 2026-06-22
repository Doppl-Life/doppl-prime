import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { scrubSecrets, REDACTION_PLACEHOLDER } from '@doppl/contracts';
import { scrubObservabilityPayload } from '../src/redaction';

/**
 * P6.5 observability Langfuse-emit-boundary scrub (KEY SAFETY RULE #4, §14). The observability TWIN of
 * the shipped P1.2 event-store `scrubEventPayload`: it COMPOSES the frozen `@doppl/contracts`
 * `scrubSecrets` (key-format + key-name layers — never reimplemented, L5) and adds the boundary-local
 * env-value layer (any payload string containing a loaded process.env secret VALUE is redacted, over
 * object KEYS + array elements + string values, with de-collision). Pure (reads no process.env —
 * secrets injected, L4), deep, idempotent, structure-preserving, non-mutating.
 */

// A non-pattern, non-sensitive-key secret value (a real Langfuse/DB credential): no `sk-`/`Bearer`/
// `Basic` pattern, under no sensitive key-name — so ONLY the env-value layer can catch it.
const SECRET = 'S3cr3t-Langfuse-P4ss-xyz';
const OTHER_SECRET = 'An0th3r-Langfuse-cr3d-99';

describe('scrubObservabilityPayload — frozen scrub + boundary env-value layer (spec §14)', () => {
  // 1 — composes the frozen scrub; with no env secrets the env-value pass is a no-op, so the output
  // IS scrubSecrets(payload) (the key-format/key-name layers run via composition, not reimpl). L10
  // positive guard.
  test('test_composes_frozen_scrub_with_no_secrets', () => {
    const payload = {
      apiNote: 'sk-ABCDEFGHIJKLMNOPQRSTUVWX', // sk- value pattern
      authHeader: 'Bearer abcdefghijklmnopqrstuvwxyz0123', // Authorization Bearer pattern
      password: 'plaintext-pw-1', // sensitive key-name → whole value redacted
    };
    expect(scrubObservabilityPayload(payload, [])).toEqual(scrubSecrets(payload));
    const out = scrubObservabilityPayload(payload, []) as Record<string, string>;
    expect(out.apiNote).toBe(REDACTION_PLACEHOLDER);
    expect(out.authHeader).toBe(REDACTION_PLACEHOLDER);
    expect(out.password).toBe(REDACTION_PLACEHOLDER);
  });

  // 2 — env-value layer redacts a loaded secret value embedded in a string (matches no key-format
  // pattern, under no sensitive key-name).
  test('test_redacts_env_value_in_string', () => {
    const payload = { trace: `prompt sent with credential ${SECRET} inline` };
    const out = scrubObservabilityPayload(payload, [SECRET]) as Record<string, string>;
    expect(out.trace).not.toContain(SECRET);
    expect(out.trace).toContain(REDACTION_PLACEHOLDER);
  });

  // 3 — a secret used as an object KEY is redacted (carry-forward §14 / L21 key-leak class): open
  // z.record payloads carry producer-controlled keys, so the env-value layer is the SOLE defense.
  test('test_redacts_secret_used_as_object_key', () => {
    const payload = { nested: { [SECRET]: 'value-A' } };
    const out = scrubObservabilityPayload(payload, [SECRET]);
    expect(JSON.stringify(out)).not.toContain(SECRET);
    const nested = (out as { nested: Record<string, string> }).nested;
    expect(Object.keys(nested)).toEqual([REDACTION_PLACEHOLDER]);
    expect(nested[REDACTION_PLACEHOLDER]).toBe('value-A');
  });

  // 4 — a secret inside an array element (and nested under one) is scrubbed.
  test('test_redacts_secret_in_array_element', () => {
    const payload = { list: [SECRET, 'clean', { raw: `model emitted ${SECRET} verbatim` }] };
    const out = scrubObservabilityPayload(payload, [SECRET]);
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  // 5 — two distinct secret keys that redact alike de-collide (`#2`, …) so neither value collapses
  // or is silently dropped.
  test('test_key_collision_de_collides', () => {
    const payload = { siblings: { [SECRET]: 'v1', [OTHER_SECRET]: 'v2' } };
    const out = scrubObservabilityPayload(payload, [SECRET, OTHER_SECRET]);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(OTHER_SECRET);
    const siblings = (out as { siblings: Record<string, string> }).siblings;
    expect(Object.values(siblings).sort()).toEqual(['v1', 'v2']); // no value lost
    expect(Object.keys(siblings)).toContain(REDACTION_PLACEHOLDER);
    expect(Object.keys(siblings).some((k) => k.startsWith(`${REDACTION_PLACEHOLDER}#`))).toBe(true);
  });

  // 6 — catastrophic-over-redaction guard: a blank/<8-char "secret" must NOT blanket-redact ordinary
  // text (a missing/short env var). `''` matches everywhere via includes(); `ab` is below the gate.
  test('test_short_or_blank_secret_no_blanket_redact', () => {
    const payload = { a: 'abacus', b: 'ordinary prose here' };
    expect(scrubObservabilityPayload(payload, ['', 'ab'])).toEqual(scrubSecrets(payload));
  });

  // 7 — idempotent (re-scrub is a no-op), structure-preserving, and non-mutating (deep copy — a direct
  // pin; idempotency + typecheck don't actually prove non-mutation).
  test('test_idempotent_structure_preserving_non_mutating', () => {
    const payload = {
      apiNote: 'sk-ABCDEFGHIJKLMNOPQRSTUVWX',
      nested: { blob: `raw ${SECRET} here`, list: [SECRET, 'clean'] },
    };
    const before = structuredClone(payload);
    const once = scrubObservabilityPayload(payload, [SECRET]);
    const twice = scrubObservabilityPayload(once, [SECRET]);
    expect(twice).toEqual(once);
    expect(payload).toEqual(before);
  });

  // 8 — pure: the scrub reads no process.env (secrets are INJECTED). A value present only in env (not
  // injected) survives unredacted; and the source references no `process.env`.
  test('test_pure_reads_no_process_env', () => {
    const payload = { blob: `contains ${SECRET} inline` };
    const out = scrubObservabilityPayload(payload, []) as Record<string, string>;
    expect(scrubObservabilityPayload(payload, [])).toEqual(scrubSecrets(payload));
    expect(out.blob).toContain(SECRET); // not injected ⇒ not redacted ⇒ no ambient env read
    // No actual env access (`process.env.X` / `process.env[...]`); prose mentions in docstrings are
    // fine — the behavioral assertion above is the real purity proof.
    const src = readFileSync(
      fileURLToPath(new URL('../src/redaction.ts', import.meta.url)),
      'utf8',
    );
    expect(/process\s*\.\s*env\s*[.[]/.test(src)).toBe(false);
  });
});
