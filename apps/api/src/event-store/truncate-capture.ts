/**
 * FB.6 — pure, byte-safe capture-field truncation (KEY SAFETY RULE #4-adjacent + the §4 payload ceiling).
 *
 * The append path's `enforcePayloadCeiling` REJECTS a payload over `MAX_PAYLOAD_BYTES` (1 MiB). A raw
 * LLM-call capture (`LlmCallTelemetry.rawResponse`/`rawReasoning`) can be large, so the runtime truncates
 * each captured field to a per-field budget WITH a queryable marker BEFORE append — the event then always
 * fits and the append SUCCEEDS (vs. silently losing the capture to a reject). Truncation runs BEFORE the
 * append-path secret scrub: a secret straddling the cut either keeps ≥20 chars after `sk-` (still matched
 * by the scrub's value-pattern → redacted) or keeps a sub-usable fragment — no usable secret survives.
 *
 * Pure (no IO, no clock, no provider), deterministic, and byte-safe: it cuts on a UTF-8 codepoint boundary
 * (never splitting a multibyte sequence into a replacement char) and the result is guaranteed ≤ `maxBytes`
 * true UTF-8 bytes (the marker's bytes are reserved). The marker is appended ONLY when it truncated.
 */

/** Inline marker appended to a truncated capture field (also reflected by the payload `truncated` flag). */
export const TRUNCATION_MARKER = '…[truncated]';

/**
 * Per-field capture budget (bytes). Two captured fields (rawResponse + rawReasoning) at this budget stay
 * well under the 1 MiB payload ceiling, leaving headroom for the rest of the envelope. 384 KiB.
 */
export const CAPTURE_FIELD_MAX_BYTES = 393_216;

export interface TruncatedCapture {
  /** The (possibly truncated + marked) value, guaranteed ≤ maxBytes true UTF-8 bytes. */
  readonly value: string;
  /** True iff the input exceeded the budget and was truncated. */
  readonly truncated: boolean;
  /** The pre-truncation true UTF-8 byte length (queryable: how much was captured originally). */
  readonly originalBytes: number;
}

/**
 * Truncate `value` to at most `maxBytes` true UTF-8 bytes on a codepoint boundary, returning a head whose
 * byte length never splits a multibyte sequence. Only called when the value already exceeds the budget.
 */
function truncateToByteBoundary(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  const buf = Buffer.from(value, 'utf8');
  let end = maxBytes;
  // A UTF-8 continuation byte is 0b10xxxxxx (0x80–0xBF). Back the cut off any continuation byte so we
  // never slice the middle of a multibyte sequence (which would decode to a U+FFFD replacement char).
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) {
    end -= 1;
  }
  return buf.subarray(0, end).toString('utf8');
}

/**
 * Truncate a single captured field to fit the budget WITH a marker. Pure + byte-safe (see module doc).
 * Returns the value verbatim (truncated:false) when it already fits; otherwise a codepoint-boundary head
 * plus {@link TRUNCATION_MARKER}, guaranteed ≤ `maxBytes` true UTF-8 bytes.
 */
export function truncateCaptureField(value: string, maxBytes: number): TruncatedCapture {
  const originalBytes = Buffer.byteLength(value, 'utf8');
  if (originalBytes <= maxBytes) {
    return { value, truncated: false, originalBytes };
  }
  const markerBytes = Buffer.byteLength(TRUNCATION_MARKER, 'utf8');
  const head = truncateToByteBoundary(value, Math.max(0, maxBytes - markerBytes));
  return { value: `${head}${TRUNCATION_MARKER}`, truncated: true, originalBytes };
}
