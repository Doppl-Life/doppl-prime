import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  RunEventEnvelope,
  validCandidateIdeaCrossDomain,
  validCriticReview,
} from '@doppl/contracts';
import { createEventStore, type AppendInput, type EventStore } from '../../../src/event-store';
import { buildServer, DEFAULT_RUN_CONFIG } from '../../../src/server';

/**
 * P6.9 — SSE run-event stream (integration, testcontainers/real PG + Fastify inject). spec(§11) SSE
 * delivery-only; SSE id = sequence; resume from Last-Event-ID (no gap/no dup before the cursor);
 * polling fallback reconstructs the identical ordered view. spec(§4) the stream carries
 * operation-start markers AND completions (live in-flight window). rule #2: the stream is
 * non-authoritative — it appends nothing + mutates no projection.
 *
 * The stream is bounded for the test via an injected no-op `sleep` + `maxIdlePolls=1` (close after one
 * empty poll) so `inject` resolves the full buffered SSE body (prod default = real sleep, unbounded).
 */

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

function ev(
  runId: string,
  seq: number,
  type: string,
  fields: Partial<AppendInput> = {},
): AppendInput {
  return {
    id: `${runId}-${seq}`,
    runId,
    type: type as AppendInput['type'],
    actor: 'runtime',
    payload: fields.payload ?? {},
    schemaVersion: 2,
    ...(fields.generationId !== undefined ? { generationId: fields.generationId } : {}),
    ...(fields.agenomeId !== undefined ? { agenomeId: fields.agenomeId } : {}),
  };
}

/** A run carrying operation-start MARKERS interleaved with COMPLETIONS (the §4/§12 in-flight window). */
async function seedStreamRun(runId: string): Promise<void> {
  await store.append(
    ev(runId, 0, 'run.configured', { payload: { seed: `scn-${runId}`, rngSeed: 1 } }),
  );
  await store.append(ev(runId, 1, 'generation.started', { generationId: 'gen_1' }));
  await store.append(
    ev(runId, 2, 'candidate.generation_started', { generationId: 'gen_1', agenomeId: 'agn_1' }), // marker
  );
  await store.append(ev(runId, 3, 'candidate.created', { payload: validCandidateIdeaCrossDomain })); // completion
  await store.append(ev(runId, 4, 'critic.review_started', { agenomeId: 'agn_1' })); // marker
  await store.append(ev(runId, 5, 'critic.reviewed', { payload: validCriticReview })); // completion
  await store.append(ev(runId, 6, 'tool_call.started')); // marker
  await store.append(ev(runId, 7, 'tool_call.finished')); // marker
  await store.append(ev(runId, 8, 'run.completed')); // completion/terminal
}

interface SseFrame {
  id: number;
  data: { sequence: number; type: string };
}

/** Parse an SSE body into ordered `{ id, data }` frames (id: <seq>\ndata: <json>\n\n). */
function parseSse(body: string): SseFrame[] {
  return body
    .split('\n\n')
    .filter((frame) => frame.trim().length > 0)
    .map((frame) => {
      const lines = frame.split('\n');
      const idLine = lines.find((l) => l.startsWith('id:'));
      const dataLine = lines.find((l) => l.startsWith('data:'));
      if (idLine === undefined || dataLine === undefined) {
        throw new Error(`malformed SSE frame: ${JSON.stringify(frame)}`);
      }
      return {
        id: Number(idLine.slice('id:'.length)),
        data: JSON.parse(dataLine.slice('data:'.length)),
      };
    });
}

/** A server whose SSE bridge is BOUNDED (no real timer; close after one empty poll) for `inject`. */
function makeApp() {
  return buildServer({
    store,
    db,
    defaultConfig: DEFAULT_RUN_CONFIG,
    newId: () => `id-${Math.floor(performance.now())}`,
    sse: { sleep: async () => {}, maxIdlePolls: 1, intervalMs: 0 },
  });
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('GET /runs/:id/stream — SSE run-event stream (spec §11/§4)', () => {
  // §11 — events stream in sequence order; each SSE `id` IS the event sequence. Positive guard.
  test('test_stream_emits_events_in_sequence_order_with_id', async () => {
    await seedStreamRun('stream-order');
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/runs/stream-order/stream' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      const frames = parseSse(res.payload);
      expect(frames.map((f) => f.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]); // ordered
      expect(frames.every((f) => f.id === f.data.sequence)).toBe(true); // id === sequence
    } finally {
      await app.close();
    }
  });

  // PD.15 (§4/§11, the DEMO-CRITICAL fix) — the SSE frame serializer omits null/undefined optionals so
  // the frozen RunEventEnvelope re-parses on the consumer: the live SSE no longer silently DROPS every
  // null-bearing event (pre-fix the web's per-frame RunEventEnvelope.parse threw → onError → dropped).
  test('test_sse_frames_omit_null_optionals_reparse', async () => {
    await seedStreamRun('stream-omit-null');
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/runs/stream-omit-null/stream' });
      expect(res.statusCode).toBe(200);
      const frames = parseSse(res.payload);
      expect(frames.length).toBeGreaterThan(0);
      for (const frame of frames) {
        const data = frame.data as unknown as Record<string, unknown>;
        for (const key of [
          'generationId',
          'agenomeId',
          'candidateId',
          'correlationId',
          'langfuseTraceId',
          'langfuseObservationId',
        ]) {
          expect(data[key]).not.toBeNull(); // ABSENT (undefined), never `null`
        }
        expect(() => RunEventEnvelope.parse(data)).not.toThrow(); // the consumer no longer drops it
      }
    } finally {
      await app.close();
    }
  });

  // §11 resume — Last-Event-ID=N (and ?lastEventId fallback) delivers ONLY sequence > N, no gap/dup
  // before the cursor; a present-but-invalid cursor is rejected (numeric-guarded 400).
  test('test_resume_from_last_event_id_no_gap_no_dup', async () => {
    await seedStreamRun('stream-resume');
    const app = makeApp();
    await app.ready();
    try {
      const header = await app.inject({
        method: 'GET',
        url: '/runs/stream-resume/stream',
        headers: { 'Last-Event-ID': '5' },
      });
      expect(header.statusCode).toBe(200);
      const ids = parseSse(header.payload).map((f) => f.id);
      expect(ids).toEqual([6, 7, 8]); // sequence > 5 only — no gap, no dup before the cursor
      expect(Math.min(...ids)).toBeGreaterThan(5);

      const query = await app.inject({
        method: 'GET',
        url: '/runs/stream-resume/stream?lastEventId=5',
      });
      expect(parseSse(query.payload).map((f) => f.id)).toEqual([6, 7, 8]); // query fallback identical

      const bad = await app.inject({
        method: 'GET',
        url: '/runs/stream-resume/stream?lastEventId=abc',
      });
      expect(bad.statusCode).toBe(400); // numeric-guarded
    } finally {
      await app.close();
    }
  });

  // §11 [med gate-fix] — an EMPTY `Last-Event-ID` = "no cursor" (SSE spec): deliver from sequence 0
  // (`Number('') === 0` must NOT silently skip seq 0 / `run.configured`); a real `Last-Event-ID: 0`
  // resumes AFTER seq 0.
  test('test_empty_last_event_id_delivers_from_start', async () => {
    await seedStreamRun('stream-empty-cursor');
    const app = makeApp();
    await app.ready();
    try {
      const empty = await app.inject({
        method: 'GET',
        url: '/runs/stream-empty-cursor/stream',
        headers: { 'Last-Event-ID': '' },
      });
      expect(parseSse(empty.payload).map((f) => f.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]); // from start

      const zero = await app.inject({
        method: 'GET',
        url: '/runs/stream-empty-cursor/stream',
        headers: { 'Last-Event-ID': '0' },
      });
      expect(parseSse(zero.payload).map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // resume after 0
    } finally {
      await app.close();
    }
  });

  // §4/§12 — the stream carries operation-start MARKERS and COMPLETIONS (not only completions).
  test('test_stream_carries_markers_and_completions', async () => {
    await seedStreamRun('stream-markers');
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/runs/stream-markers/stream' });
      const types = parseSse(res.payload).map((f) => f.data.type);
      expect(types).toContain('tool_call.started'); // marker
      expect(types).toContain('critic.review_started'); // marker
      expect(types).toContain('candidate.created'); // completion
      expect(types).toContain('run.completed'); // completion
    } finally {
      await app.close();
    }
  });

  // rule #2 — the stream is delivery-only/non-authoritative: it appends no event + mutates nothing;
  // streaming twice is byte-identical (no mutation between reads).
  test('test_stream_delivery_only_non_authoritative', async () => {
    await seedStreamRun('stream-immutable');
    const before = (await store.readByRun('stream-immutable')).length;
    const app = makeApp();
    await app.ready();
    try {
      const first = await app.inject({ method: 'GET', url: '/runs/stream-immutable/stream' });
      expect(first.statusCode).toBe(200);
      const after = (await store.readByRun('stream-immutable')).length;
      expect(after).toBe(before); // the stream appended nothing
      const second = await app.inject({ method: 'GET', url: '/runs/stream-immutable/stream' });
      expect(second.payload).toBe(first.payload); // non-authoritative: re-stream is identical
    } finally {
      await app.close();
    }
  });

  // §11 — disconnect/resync equivalence: a prefix (drop after seq 3) ++ a resume-from-cursor equals
  // the uninterrupted stream (sequence is the sole ordering key — no gap, no dup).
  test('test_resync_equivalent_to_uninterrupted', async () => {
    await seedStreamRun('stream-resync');
    const app = makeApp();
    await app.ready();
    try {
      const uninterrupted = parseSse(
        (await app.inject({ method: 'GET', url: '/runs/stream-resync/stream' })).payload,
      ).map((f) => f.id);

      // client saw through seq 3, then dropped; it reconnects from its last-seen cursor.
      const prefix = uninterrupted.filter((id) => id <= 3);
      const resume = parseSse(
        (
          await app.inject({
            method: 'GET',
            url: '/runs/stream-resync/stream',
            headers: { 'Last-Event-ID': '3' },
          })
        ).payload,
      ).map((f) => f.id);

      expect([...prefix, ...resume]).toEqual(uninterrupted); // identical ordered view
    } finally {
      await app.close();
    }
  });

  // §11 — unknown runId → clean 404 (not a partial/hung stream); the polling fallback (GET /events)
  // reconstructs the SAME ordered view as the stream for a known run.
  test('test_unknown_run_clean_close_and_fallback_equivalence', async () => {
    await seedStreamRun('stream-fallback');
    const app = makeApp();
    await app.ready();
    try {
      const unknown = await app.inject({ method: 'GET', url: '/runs/does-not-exist/stream' });
      expect(unknown.statusCode).toBe(404);

      const streamed = parseSse(
        (await app.inject({ method: 'GET', url: '/runs/stream-fallback/stream' })).payload,
      ).map((f) => f.id);
      const polled = (
        await app.inject({ method: 'GET', url: '/runs/stream-fallback/events' })
      ).json() as { events: { sequence: number }[] };
      expect(streamed).toEqual(polled.events.map((e) => e.sequence)); // fallback == stream
    } finally {
      await app.close();
    }
  });
});
