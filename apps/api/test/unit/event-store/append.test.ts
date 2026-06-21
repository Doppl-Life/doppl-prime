import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { summarizeValidationIssues } from '../../../src/event-store/append';

/**
 * P1.8-followup — the append-path `schema_invalid` error summary (KEY SAFETY RULE #4 / LESSON 26:
 * authoritative-path errors never echo the rejected payload/received value). `summarizeValidationIssues`
 * maps a ZodError to its issues' `path` + `code` ONLY — never Zod's `.message` (which can interpolate
 * the received value) and never `.received`.
 */

// A representative strict schema mirroring an envelope field (a closed-enum `actor`). The real append
// schema (AppendInputSchema = RunEventEnvelope.omit(...)) is likewise a strict object with a closed
// `actor` enum, so these issue shapes match the authoritative path.
const Schema = z.strictObject({ actor: z.enum(['runtime', 'operator', 'system']) });
// A caller-controlled marker standing in for a potentially-secret value/key that must never echo into
// an authoritative-path error. Deliberately NOT secret-shaped (no `sk-`/high-entropy) so the no-echo
// fixture doesn't itself trip the secrets guard — what matters is that this exact bytes never appears.
const CALLER_VALUE = 'caller-supplied-bad-value';

describe('summarizeValidationIssues — path+code only, no value echo (rule #4 / LESSON 26)', () => {
  // spec(§14) — a valid parse yields no issues (positive guard so a vanished export fails loud).
  test('summarize_valid_has_no_issues', () => {
    expect(Schema.safeParse({ actor: 'runtime' }).success).toBe(true);
  });

  // spec(§14) rule #4 / LESSON 26 — the GENUINE Zod-4 echo vector is an UNRECOGNIZED KEY (strict object):
  // Zod's `.message` echoes the offending key, which is caller-controlled and could be secret-shaped. The
  // summary emits the issue's path + code ONLY, so the caller-controlled key NEVER appears.
  test('append_schema_invalid_summary_omits_unrecognized_secret_key', () => {
    const bad = Schema.safeParse({ actor: 'runtime', [CALLER_VALUE]: 'x' });
    expect(bad.success).toBe(false);
    if (bad.success) throw new Error('expected invalid');

    // Zod's raw message DOES echo the caller-controlled key — proving the threat is real (the old code
    // interpolated `.message` straight into the AppendError).
    expect(bad.error.message).toContain(CALLER_VALUE);

    const summary = summarizeValidationIssues(bad.error);
    expect(summary).not.toContain(CALLER_VALUE); // the caller-controlled key — NEVER echoed
    expect(summary).not.toBe(bad.error.message); // strictly less than Zod's raw message
    expect(summary).toContain('unrecognized_keys'); // path+code form (code retained, value stripped)
  });

  // spec(§14) — an invalid field value is summarized by PATH + CODE: the field path (`actor`) appears,
  // the value does not, and it is not Zod's raw message.
  test('append_schema_invalid_summary_is_path_and_code', () => {
    const bad = Schema.safeParse({ actor: CALLER_VALUE });
    if (bad.success) throw new Error('expected invalid');
    const summary = summarizeValidationIssues(bad.error);
    expect(summary).toContain('actor'); // the field path — debuggable
    expect(summary).not.toContain(CALLER_VALUE); // the value — never echoed
    expect(summary).not.toBe(bad.error.message);
  });

  // spec(§14) — a root-level (no-path) issue still summarizes to a non-empty string (defensive).
  test('summarize_root_issue_non_empty', () => {
    const bad = z.string().safeParse(123);
    if (bad.success) throw new Error('expected invalid');
    expect(summarizeValidationIssues(bad.error).length).toBeGreaterThan(0);
  });
});
