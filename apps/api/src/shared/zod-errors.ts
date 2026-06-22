import type { z } from 'zod';

/**
 * Shared Zod-error summarizer (P3.1; KEY SAFETY RULE #4 / LESSON 26 single-source).
 *
 * Summarize a ZodError for an AUTHORITATIVE / boot-path error message using each issue's `path` + `code`
 * ONLY — never Zod's `.message` (which can interpolate the received value), `.received`, or `.keys`
 * (which echoes an offending caller-controlled key). `path` is field names / array indices (schema
 * structure, not data) and `code` is a Zod enum, so neither can carry a secret value.
 *
 * Single-sourced (LESSON 27): both the event-store append path (P1.3/kernel-014) and the boot-config
 * loader (P3.1) use this one copy — two copies of a no-echo safety primitive risk drift where one
 * starts echoing.
 */
export function summarizeZodIssues(error: z.ZodError): string {
  const parts = error.issues.map((issue) => {
    const path = issue.path
      .map((p) => (typeof p === 'symbol' ? p.toString() : String(p)))
      .join('.');
    return path.length > 0 ? `${path}: ${issue.code}` : issue.code;
  });
  return parts.length > 0 ? parts.join('; ') : 'schema validation failed';
}
