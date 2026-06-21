import { describe, expect, test } from 'vitest';
import { scrubSecrets, REDACTION_PLACEHOLDER } from '@doppl/contracts';
import { scrubEventPayload } from '../../../src/event-store/redaction';

/**
 * P1.2 event-store secret-redaction scrub (KEY SAFETY RULE #4, §14). The boundary scrub composes the
 * frozen `scrubSecrets` (key-format / key-name / secret-key layers) and adds the env-value layer
 * (ratified Option A) — redacting payload strings that contain a loaded process.env secret *value*.
 * Its output IS the persisted truth, so it must never leak a covered secret and never corrupt prose.
 */

// A non-pattern, non-sensitive-key secret value (a real DB password): no `sk-`/`Bearer`/`Basic`
// pattern, sits under no sensitive key-name — so ONLY the env-value layer can catch it.
const DB_SECRET = 'S3cr3t-DB-P4ssw0rd-xyz';

describe('scrubEventPayload — composes frozen scrub + env-value layer', () => {
  // spec(§14) — the frozen key-format/key-name/secret-key layers run via composition (not reimpl).
  test('test_composes_frozen_scrub_layers', () => {
    const payload = {
      apiNote: 'sk-ABCDEFGHIJKLMNOPQRSTUVWX', // sk- value pattern
      authHeader: 'Bearer abcdefghijklmnopqrstuvwxyz0123', // Authorization Bearer pattern
      password: 'plaintext-db-pw-1', // sensitive key-name → whole value redacted
    };
    // With no env secrets the env-value pass is a no-op, so the result IS the frozen scrub's output.
    expect(scrubEventPayload(payload, [])).toEqual(scrubSecrets(payload));
    const out = scrubEventPayload(payload, []) as Record<string, string>;
    expect(out.apiNote).toBe(REDACTION_PLACEHOLDER);
    expect(out.authHeader).toBe(REDACTION_PLACEHOLDER);
    expect(out.password).toBe(REDACTION_PLACEHOLDER);
  });

  // spec(§14) — env-value layer catches a secret matching no key-format pattern under no sensitive key.
  test('test_env_value_layer_redacts_loaded_secret', () => {
    const payload = { connectionString: `postgres://user:${DB_SECRET}@host:5432/db` };
    const out = scrubEventPayload(payload, [DB_SECRET]) as Record<string, string>;
    expect(out.connectionString).not.toContain(DB_SECRET);
    expect(out.connectionString).toContain(REDACTION_PLACEHOLDER);
  });

  // spec(§14) — deep over nested objects, arrays, and inline raw/normalized provider output blobs.
  test('test_env_value_deep_in_nested_objects_and_arrays', () => {
    const payload = {
      generation: { outputs: ['ok', { raw: `model emitted ${DB_SECRET} verbatim` }] },
      list: [DB_SECRET, 'clean'],
    };
    const out = scrubEventPayload(payload, [DB_SECRET]);
    expect(JSON.stringify(out)).not.toContain(DB_SECRET);
  });

  // spec(§14) — catastrophic-over-redaction guard: blank/short "secrets" must NOT redact ordinary text.
  test('test_empty_or_short_secret_value_does_not_over_redact', () => {
    const payload = { a: 'abacus', b: 'ordinary prose here' };
    // '' would match every string via includes(); 'ab' is below the length gate — both filtered out.
    expect(scrubEventPayload(payload, ['', 'ab'])).toEqual(scrubSecrets(payload));
  });

  // LESSONS 3 — idempotent: re-scrub is a no-op (the placeholder matches no secret).
  test('test_idempotent', () => {
    const payload = {
      apiNote: 'sk-ABCDEFGHIJKLMNOPQRSTUVWX',
      blob: `raw ${DB_SECRET} here`,
    };
    const once = scrubEventPayload(payload, [DB_SECRET]);
    const twice = scrubEventPayload(once, [DB_SECRET]);
    expect(twice).toEqual(once);
  });

  // LESSONS 4 — pure: with no injected secrets the output equals the frozen scrub; the function never
  // reads process.env (a value present ONLY in the env, not injected, survives unredacted).
  test('test_pure_no_env_read', () => {
    const payload = { blob: `contains ${DB_SECRET} inline` };
    const out = scrubEventPayload(payload, []) as Record<string, string>;
    expect(scrubEventPayload(payload, [])).toEqual(scrubSecrets(payload));
    expect(out.blob).toContain(DB_SECRET); // not injected ⇒ not redacted ⇒ no ambient env read
  });

  // LESSONS 3 — no corruption: a string sharing only a short prefix with the secret is untouched.
  test('test_non_secret_prose_preserved', () => {
    const payload = { note: 'logged S3cr3t-DB connection at boot' }; // partial, not the full secret
    const out = scrubEventPayload(payload, [DB_SECRET]) as Record<string, string>;
    expect(out.note).toBe('logged S3cr3t-DB connection at boot');
  });

  // spec(§14) — env-value layer also redacts a secret used as an object KEY. Open z.record payloads
  // (30/36 event types fall to the generic open-key schema) carry producer-controlled keys, so a
  // non-format secret-as-key is the env-value layer's SOLE defense. Redacted at any depth, WITH
  // de-collision so two secret-keys redacting alike don't collapse and lose a value (LESSONS 3).
  test('test_env_value_redacts_secret_in_object_key', () => {
    const otherSecret = 'An0th3r-DB-cr3d-pw99'; // a second distinct non-format secret
    const payload = {
      nested: { [DB_SECRET]: 'value-A' }, // secret as a key, nested
      siblings: { [DB_SECRET]: 'v1', [otherSecret]: 'v2' }, // two secret keys → collision
    };
    const out = scrubEventPayload(payload, [DB_SECRET, otherSecret]);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(DB_SECRET); // secret gone from key positions too
    expect(serialized).not.toContain(otherSecret);

    const nested = (out as { nested: Record<string, string> }).nested;
    expect(Object.keys(nested)).toEqual([REDACTION_PLACEHOLDER]);
    expect(nested[REDACTION_PLACEHOLDER]).toBe('value-A');

    const siblings = (out as { siblings: Record<string, string> }).siblings;
    expect(Object.values(siblings).sort()).toEqual(['v1', 'v2']); // de-collision: no value lost
    expect(Object.keys(siblings)).toContain(REDACTION_PLACEHOLDER);
    expect(Object.keys(siblings).some((k) => k.startsWith(`${REDACTION_PLACEHOLDER}#`))).toBe(true);
  });

  // LESSONS 3 / rule #4 — non-mutating: the scrub returns a deep copy; the input is never mutated
  // (a direct pin — idempotency + typecheck do not actually prove non-mutation).
  test('test_does_not_mutate_input', () => {
    const payload = {
      apiNote: 'sk-ABCDEFGHIJKLMNOPQRSTUVWX',
      nested: { blob: `raw ${DB_SECRET} here`, list: [DB_SECRET, 'clean'] },
    };
    const before = structuredClone(payload);
    scrubEventPayload(payload, [DB_SECRET]);
    expect(payload).toEqual(before);
  });
});
