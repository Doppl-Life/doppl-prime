/**
 * PD.15 — the shared WIRE serializer for run-event envelopes (ARCHITECTURE.md §11/§4, KEY SAFETY
 * RULES #2/#4). drizzle returns DB-`null` for an absent optional column; `JSON.stringify(row)` emits
 * `null`; the frozen `RunEventEnvelope` (`.optional()`, NOT `.nullable()`) REJECTS `null` on the
 * consumer (the web) → the live SSE silently DROPS every event + `getEvents` PayloadValidationErrors
 * (the PD.14 Finding). This OMITS null/undefined keys so the wire form re-parses against the frozen
 * schema — fixing the drift at its SOURCE, never by loosening the frozen contract to `.nullable()`.
 *
 * READ-path / presentation ONLY:
 * - rule #2: it transforms a row READ from the authoritative log FOR THE WIRE; it NEVER writes the log
 *   (the event store + its rows are untouched — serialization is derived/rebuildable).
 * - rule #4: it runs on rows ALREADY scrubbed at append; it only DROPS keys (never adds/reveals a
 *   value), so it cannot re-expose a secret.
 *
 * Deep by design: because NO frozen contract uses `.nullable()`, a `null` ALWAYS means "absent
 * optional" — so dropping null/undefined keys at EVERY object depth aligns the envelope fields AND the
 * nested per-type payload fields (the dashboard panels parse those per-type). Guards:
 * - a `Date` (occurredAt) is preserved as-is so `JSON.stringify` emits its ISO string, NOT `{}` from
 *   `Object.entries(date)` (LESSON §31 — a Date collapses to `{}` under a naive object walk);
 * - array ELEMENTS are preserved (never dropped) and only recursed into.
 * Pure — the input is not mutated.
 */
function omitNullish(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(omitNullish);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child === null || child === undefined) continue;
      out[key] = omitNullish(child);
    }
    return out;
  }
  return value;
}

/**
 * Serialize a run-event row to its wire form: drop null/undefined optionals (deep) so the frozen
 * `RunEventEnvelope` re-parses on the consumer. Used by `GET /runs/:id/events` + the SSE frame
 * serializer (the only routes emitting raw drizzle rows; the projection routes build their shapes
 * in-memory and carry no DB-null).
 */
export function serializeEnvelope(row: unknown): unknown {
  return omitNullish(row);
}
