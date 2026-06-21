import type { EvidenceRef } from '@doppl/contracts';
import type { EventStore, RunEventRow } from './append';

/**
 * EvidenceRef resolver (P1.7, ARCHITECTURE.md §9/§4/§14, KEY SAFETY RULES #7 + #4).
 *
 * Dereferences an `EvidenceRef` strictly within the Postgres tier. `resolveEvidenceRef` is PURE over a
 * run's persisted rows — it has NO fetch / IO seam, so "resolution makes no model / embedding / web /
 * network call" is STRUCTURAL, not a runtime guard: replay (P1.8) reproduces every pointer
 * deterministically (rule #7). An external pointer (a web `uri` OR the §6/§13 NON-authoritative Langfuse
 * observation id) fails CLOSED — never fetched. The resolved `payload` was already secret-scrubbed at
 * append (P1.2, rule #4) and is returned UNMODIFIED — the resolver is read-only over the authoritative log.
 */

export type EvidenceUnresolvedReason = 'not_found' | 'external_only' | 'no_pointer';

export type EvidenceResolution =
  | { resolved: true; eventId: string; payload: unknown; row: RunEventRow }
  | { resolved: false; reason: EvidenceUnresolvedReason };

/**
 * Resolve `ref` against a run's persisted rows. Pure + read-only. The ONLY Postgres-resolvable pointer
 * is `eventId`, matched by EXACT equality (ids are opaque untrusted strings — never substring/prefix/
 * concat). A non-Postgres pointer fails closed: an external `uri`/`langfuseObservationId` → `external_only`
 * (never fetched), no resolvable pointer at all → `no_pointer`.
 */
export function resolveEvidenceRef(
  ref: EvidenceRef,
  events: readonly RunEventRow[],
): EvidenceResolution {
  if (ref.eventId !== undefined) {
    const row = events.find((event) => event.id === ref.eventId);
    if (row === undefined) {
      return { resolved: false, reason: 'not_found' };
    }
    return { resolved: true, eventId: ref.eventId, payload: row.payload, row };
  }
  // No eventId: a web uri OR the non-authoritative Langfuse observation is not reproducible on replay
  // → fail CLOSED, never fetched (rule #7 / §14).
  if (ref.uri !== undefined || ref.langfuseObservationId !== undefined) {
    return { resolved: false, reason: 'external_only' };
  }
  // No resolvable pointer at all (e.g. a label-only ref).
  return { resolved: false, reason: 'no_pointer' };
}

export interface EvidenceResolver {
  resolve(runId: string, ref: EvidenceRef): Promise<EvidenceResolution>;
}

/**
 * Thin async convenience over the pure core: `readByRun(runId)` ONCE per run (the read promise is
 * memoized), then resolve refs against that set. Wraps {@link resolveEvidenceRef} — never duplicates the
 * resolution logic. The cache is read-once-per-run; create a fresh resolver per projection/replay pass
 * when fresh rows are required.
 */
export function createEvidenceResolver(store: Pick<EventStore, 'readByRun'>): EvidenceResolver {
  const byRun = new Map<string, Promise<RunEventRow[]>>();
  return {
    async resolve(runId, ref) {
      let read = byRun.get(runId);
      if (read === undefined) {
        read = store.readByRun(runId);
        byRun.set(runId, read);
        // Memoizing the PROMISE dedups concurrent first-resolves; evict on rejection so a transient
        // read failure isn't cached forever (a retry re-reads). The failure still propagates to the
        // caller — fails closed, never a stale/wrong row.
        read.catch(() => byRun.delete(runId));
      }
      return resolveEvidenceRef(ref, await read);
    },
  };
}
