import { describe, expect, test } from 'vitest';
import type { EvidenceRef } from '@doppl/contracts';
import type { RunEventRow } from '../../../src/event-store/append';
import {
  createEvidenceResolver,
  resolveEvidenceRef,
} from '../../../src/event-store/evidence-resolver';

/**
 * P1.7 EvidenceRef resolver (ARCHITECTURE.md §9/§4/§14, KEY SAFETY RULES #7 + #4).
 *
 * A PURE function that dereferences an EvidenceRef strictly within the Postgres tier: an eventId ref
 * resolves to its persisted run_events row; an external pointer (uri / langfuseObservationId) fails
 * CLOSED — never fetched — so every pointer is reproducible during replay with no model/web/network
 * calls (rule #7). The resolved payload (already P1.2-scrubbed at append, rule #4) is returned unmodified.
 */

function makeRow(id: string, payload: unknown, overrides: Partial<RunEventRow> = {}): RunEventRow {
  return {
    id,
    runId: 'run-1',
    generationId: null,
    agenomeId: null,
    candidateId: null,
    type: 'check.completed',
    sequence: 0,
    occurredAt: new Date(0),
    actor: 'check_runner',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload,
    schemaVersion: 2,
    ...overrides,
  };
}

const rows: RunEventRow[] = [
  makeRow('evt-1', { status: 'passed', detail: 'check ok' }, { sequence: 0 }),
  makeRow('evt-2', { status: 'failed' }, { sequence: 1 }),
  makeRow('evt-10', { status: 'skipped' }, { sequence: 2 }),
];

const eventIdRef: EvidenceRef = { kind: 'check_output', eventId: 'evt-1' };

describe('resolveEvidenceRef — eventId dereference within Postgres (§9)', () => {
  // spec(§9) — an eventId ref resolves to the persisted row whose id === ref.eventId, returning both
  // the payload (common dereference) and the full row (correlation ids / type / sequence).
  test('resolve_event_id_ref_to_persisted_row', () => {
    const result = resolveEvidenceRef(eventIdRef, rows);
    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.eventId).toBe('evt-1');
    expect(result.payload).toEqual({ status: 'passed', detail: 'check ok' });
    expect(result.row).toBe(rows[0]);
  });

  // spec(§9) — a dangling eventId (no matching row) fails safe with `not_found`; never throws, never
  // returns a wrong row.
  test('resolve_event_id_not_found', () => {
    expect(resolveEvidenceRef(eventIdRef, rows).resolved).toBe(true); // positive guard (lesson §10)
    const result = resolveEvidenceRef({ kind: 'check_output', eventId: 'evt-missing' }, rows);
    expect(result).toEqual({ resolved: false, reason: 'not_found' });
  });

  // spec(carry-forward) — ids are opaque untrusted strings, matched by EXACT equality: 'evt-1' must NOT
  // match a row id 'evt-10' (no substring/prefix/concat).
  test('resolve_id_matched_by_equality_not_substring', () => {
    const onlyEvt10 = [makeRow('evt-10', { status: 'skipped' })];
    expect(
      resolveEvidenceRef({ kind: 'check_output', eventId: 'evt-10' }, onlyEvt10).resolved,
    ).toBe(true); // positive guard
    const result = resolveEvidenceRef({ kind: 'check_output', eventId: 'evt-1' }, onlyEvt10);
    expect(result).toEqual({ resolved: false, reason: 'not_found' });
  });
});

describe('resolveEvidenceRef — fail-closed on non-Postgres pointers (rule #7 / §14)', () => {
  // spec(rule #7/§14) — a uri-only ref (no eventId) fails CLOSED with `external_only`; the resolver
  // never fetches the uri (it is a pure function — no network seam to call).
  test('resolve_external_uri_only_fails_closed', () => {
    expect(resolveEvidenceRef(eventIdRef, rows).resolved).toBe(true); // positive guard
    const result = resolveEvidenceRef({ kind: 'prior_art', uri: 'https://example.test/x' }, rows);
    expect(result).toEqual({ resolved: false, reason: 'external_only' });
  });

  // spec(rule #7/§14) — a langfuseObservationId-only ref (no eventId) is ALSO an external pointer
  // (Langfuse is the §6 non-authoritative side channel) → fails closed `external_only`, never fetched.
  test('resolve_langfuse_observation_only_fails_closed', () => {
    expect(resolveEvidenceRef(eventIdRef, rows).resolved).toBe(true); // positive guard
    const result = resolveEvidenceRef({ kind: 'trace', langfuseObservationId: 'obs-1' }, rows);
    expect(result).toEqual({ resolved: false, reason: 'external_only' });
  });

  // spec(§9) — a ref with NO Postgres-resolvable pointer and no external pointer → `no_pointer`
  // (defensive completeness of the fail-closed taxonomy).
  test('resolve_no_pointer_ref', () => {
    expect(resolveEvidenceRef(eventIdRef, rows).resolved).toBe(true); // positive guard
    const result = resolveEvidenceRef({ kind: 'other' }, rows);
    expect(result).toEqual({ resolved: false, reason: 'no_pointer' });
  });
});

describe('resolveEvidenceRef — pure / read-only / replay-deterministic (rule #7)', () => {
  // spec(rule #7) — the resolver reads ONLY the passed rows: same ref + frozen rows twice → identical
  // result; the rows array is not mutated (no clock/random/IO touched).
  test('resolve_reads_only_passed_rows_deterministic', () => {
    const frozen = Object.freeze([...rows]) as readonly RunEventRow[];
    const first = resolveEvidenceRef(eventIdRef, frozen);
    const second = resolveEvidenceRef(eventIdRef, frozen);
    expect(first).toEqual(second);
    expect(frozen.length).toBe(rows.length); // not mutated
  });

  // spec(rule #4) — the resolved payload is the persisted (already-scrubbed) payload returned
  // UNMODIFIED; the resolver neither re-scrubs nor mutates it.
  test('resolve_returns_payload_unmodified', () => {
    const payload = { status: 'passed', nested: { a: 1 } };
    const local = [makeRow('evt-x', payload)];
    const result = resolveEvidenceRef({ kind: 'check_output', eventId: 'evt-x' }, local);
    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.payload).toBe(payload); // same reference — unmodified, un-re-scrubbed
  });
});

describe('createEvidenceResolver — thin async wrapper over the pure core (lesson 20)', () => {
  // spec(§9) — readByRun-once-then-resolve: a second resolve in the same run reuses the read (no second
  // readByRun); the wrapper never duplicates the pure resolution logic.
  test('create_evidence_resolver_reads_by_run_then_resolves', async () => {
    let readCount = 0;
    const fakeStore = {
      readByRun(runId: string): Promise<RunEventRow[]> {
        readCount += 1;
        void runId;
        return Promise.resolve(rows);
      },
    };
    const resolver = createEvidenceResolver(fakeStore);
    const first = await resolver.resolve('run-1', eventIdRef);
    const second = await resolver.resolve('run-1', { kind: 'check_output', eventId: 'evt-2' });
    expect(readCount).toBe(1); // reused the single read
    expect(first.resolved).toBe(true);
    expect(second.resolved).toBe(true);
    if (second.resolved) expect(second.eventId).toBe('evt-2');
  });

  // spec(§9) — a transient readByRun failure is NOT cached forever: the rejection propagates (fails
  // closed) but is evicted, so a retry re-reads and succeeds.
  test('create_evidence_resolver_retries_after_failed_read', async () => {
    let readCount = 0;
    const fakeStore = {
      readByRun(): Promise<RunEventRow[]> {
        readCount += 1;
        if (readCount === 1) return Promise.reject(new Error('transient db error'));
        return Promise.resolve(rows);
      },
    };
    const resolver = createEvidenceResolver(fakeStore);
    await expect(resolver.resolve('run-1', eventIdRef)).rejects.toThrow('transient db error');
    const retry = await resolver.resolve('run-1', eventIdRef); // re-reads (not poisoned)
    expect(retry.resolved).toBe(true);
    expect(readCount).toBe(2);
  });
});
