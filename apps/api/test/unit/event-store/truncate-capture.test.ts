import { describe, expect, test } from 'vitest';
import {
  CAPTURE_FIELD_MAX_BYTES,
  TRUNCATION_MARKER,
  truncateCaptureField,
} from '../../../src/event-store/truncate-capture';

/**
 * FB.6 — the pure capture-truncation helper (KEY SAFETY RULE #4-adjacent + the 1 MiB ceiling). A raw
 * capture exceeding the per-field budget is truncated WITH a queryable marker so the event payload stays
 * under MAX_PAYLOAD_BYTES and the append NEVER fails on a large capture (vs the current reject). Pure +
 * byte-safe (true UTF-8 bytes, no split multibyte) + idempotent-shaped (marker only when it truncated).
 */
describe('truncateCaptureField (FB.6 — pure, byte-safe capture truncation)', () => {
  test('test_truncate_under_budget_passthrough', () => {
    // a value within budget is returned verbatim, truncated:false, with its true UTF-8 byte length.
    const v = 'a small raw response';
    const r = truncateCaptureField(v, 1000);
    expect(r.value).toBe(v);
    expect(r.truncated).toBe(false);
    expect(r.originalBytes).toBe(Buffer.byteLength(v, 'utf8'));
  });

  test('test_truncate_over_budget_marks_and_bounds', () => {
    // over budget → truncated:true, marker appended, the result is bounded to <= maxBytes (true bytes),
    // and originalBytes records the pre-truncation size (queryable: a reader knows the capture is partial).
    const v = 'a'.repeat(5000);
    const r = truncateCaptureField(v, 1000);
    expect(r.truncated).toBe(true);
    expect(r.value.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(Buffer.byteLength(r.value, 'utf8')).toBeLessThanOrEqual(1000);
    expect(r.originalBytes).toBe(5000);
  });

  test('test_truncate_multibyte_safe', () => {
    // a 4-byte-codepoint string truncated at a budget straddling a codepoint must NOT split it (no U+FFFD
    // replacement char) and must still stay under the byte budget.
    const v = '🎉'.repeat(1000); // 4000 UTF-8 bytes
    const r = truncateCaptureField(v, 1001);
    expect(r.truncated).toBe(true);
    expect(Buffer.byteLength(r.value, 'utf8')).toBeLessThanOrEqual(1001);
    expect(r.value).not.toContain('�'); // no broken multibyte
  });

  test('test_truncate_pure_deterministic', () => {
    // pure: same input → byte-identical output across calls (replay-stable helper).
    const v = 'b'.repeat(5000);
    expect(truncateCaptureField(v, 1000)).toEqual(truncateCaptureField(v, 1000));
  });

  test('test_capture_field_max_bytes_under_ceiling', () => {
    // two captured fields at the per-field budget stay well under the 1 MiB payload ceiling (headroom for
    // the rest of the envelope) — so a capture-bearing event always fits.
    expect(CAPTURE_FIELD_MAX_BYTES * 2).toBeLessThan(1_048_576);
  });
});
