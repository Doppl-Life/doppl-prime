import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { REQUIRED_CREDENTIAL_ENV } from '../../../src/model-gateway/registry';
import { ENV_ALLOWLIST_VARS } from '../../../src/runtime/config/envSchema';
import { BOOT_ORCHESTRATION_ENV } from '../../../src/main';

/**
 * PD.8b — `.env.example` drift-guard (ARCHITECTURE.md §15/§14/§17). The committed `.env.example` is
 * SINGLE-SOURCED from the boot env allowlist: the required credentials (`REQUIRED_CREDENTIAL_ENV`), the
 * closed config-override allowlist (`ENV_ALLOWLIST_VARS`), and the boot-orchestration vars
 * (`BOOT_ORCHESTRATION_ENV`) — all IMPORTED from the code, never hand-copied. So a future allowlist
 * add/remove fails this test until `.env.example` is updated (no silent drift, §15). Rule #4: every
 * credential carries an obvious placeholder, never a real secret value.
 *
 * (Langfuse is intentionally NOT listed — it is non-authoritative + NOT wired into boot (P2.8 deferred);
 * `packages/observability` defines no `LANGFUSE_*` env var, so listing one would INVENT a name that does
 * nothing. The closed-equality set is exactly the code-constant allowlist; Langfuse joins when P2.8 wires it.)
 */

const ENV_EXAMPLE_PATH = fileURLToPath(new URL('../../../../../.env.example', import.meta.url));

interface EnvLine {
  key: string;
  value: string;
  comment: string;
}

/** Parse `.env.example` into KEY/value/comment rows; skip blank + full-comment lines. */
function parseEnvExample(): EnvLine[] {
  const text = readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  const rows: EnvLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const hashIdx = line.indexOf('#'); // none of our values contain '#'
    const assignment = (hashIdx >= 0 ? line.slice(0, hashIdx) : line).trim();
    const comment = hashIdx >= 0 ? line.slice(hashIdx + 1).trim() : '';
    const eq = assignment.indexOf('=');
    if (eq < 0) continue;
    rows.push({
      key: assignment.slice(0, eq).trim(),
      value: assignment.slice(eq + 1).trim(),
      comment,
    });
  }
  return rows;
}

const CODE_ALLOWLIST: readonly string[] = [
  ...REQUIRED_CREDENTIAL_ENV,
  ...ENV_ALLOWLIST_VARS,
  ...BOOT_ORCHESTRATION_ENV,
];

describe('.env.example drift-guard — single-sourced from the boot env allowlist (spec §15)', () => {
  // spec(§15) — the example lists EXACTLY the code allowlist (required creds ∪ ENV_ALLOWLIST ∪ boot vars),
  // imported from code → a future allowlist change fails until the example is updated (no drift).
  test('env_example_lists_exactly_the_code_allowlist', () => {
    const keys = parseEnvExample().map((r) => r.key);
    expect([...new Set(keys)].sort()).toEqual([...new Set(CODE_ALLOWLIST)].sort());
  });

  // spec(§14 / rule #4) — every credential var carries an OBVIOUS placeholder, never a real-key-shaped value.
  test('env_example_credentials_are_placeholders_not_secrets', () => {
    const rows = parseEnvExample();
    const PLACEHOLDER = /REPLACE_ME|REPLACE|CHANGEME|changeme|your[-_]|example|placeholder/i;
    const REAL_KEY_SHAPE = /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/; // OpenAI/OpenRouter-style live keys
    // non-vacuous guard (LESSON §10): the heuristic DOES catch a real-looking key, so the negative
    // assertions below aren't trivially true against a broken regex.
    expect(REAL_KEY_SHAPE.test('sk-or-v1-0123456789abcdefABCDEF0123')).toBe(true);
    for (const cred of REQUIRED_CREDENTIAL_ENV) {
      const row = rows.find((r) => r.key === cred);
      expect(row, `${cred} must be present in .env.example`).toBeDefined();
      expect(PLACEHOLDER.test(row!.value), `${cred} value must be an obvious placeholder`).toBe(
        true,
      );
      expect(REAL_KEY_SHAPE.test(row!.value), `${cred} value must not look like a real key`).toBe(
        false,
      );
    }
  });

  // operator clarity (the user's deliverable) — every var marks REQUIRED/OPTIONAL; the 3 credentials are
  // REQUIRED, the knobs + boot-orchestration vars are OPTIONAL.
  test('env_example_marks_required_vs_optional', () => {
    const rows = parseEnvExample();
    for (const row of rows) {
      expect(
        /\b(REQUIRED|OPTIONAL)\b/.test(row.comment),
        `${row.key} must mark REQUIRED/OPTIONAL`,
      ).toBe(true);
    }
    for (const cred of REQUIRED_CREDENTIAL_ENV) {
      const row = rows.find((r) => r.key === cred)!;
      expect(/\bREQUIRED\b/.test(row.comment), `${cred} must be marked REQUIRED`).toBe(true);
    }
    for (const opt of [...ENV_ALLOWLIST_VARS, ...BOOT_ORCHESTRATION_ENV]) {
      const row = rows.find((r) => r.key === opt)!;
      expect(/\bOPTIONAL\b/.test(row.comment), `${opt} must be marked OPTIONAL`).toBe(true);
    }
  });

  // spec(§15) — converse of the equality: no `.env.example` key outside the closed code allowlist (a
  // stale/typo'd var can't mislead the operator into setting something boot never reads).
  test('env_example_has_no_unknown_vars', () => {
    const unknown = parseEnvExample()
      .map((r) => r.key)
      .filter((k) => !CODE_ALLOWLIST.includes(k));
    expect(unknown, `unknown env vars in .env.example: ${unknown.join(', ')}`).toEqual([]);
  });
});
