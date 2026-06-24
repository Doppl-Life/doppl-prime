import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import { ReplayIntegrityError } from '../../../src/event-store/replay-reader';
import {
  buildSeedPlan,
  seedDemo,
  type SerializedReplayFixture,
  type SerializedRow,
} from '../../../src/event-store/scripts/seed-demo';

/**
 * PD.2 seed-demo — pure `buildSeedPlan` core (ARCHITECTURE.md §17/§4, KEY SAFETY RULES #2/#7). Gates the
 * fixture `schemaVersion ≤ current` (fail-fast re-record if newer — §17 re-record-not-upcast), deserializes
 * each row's `occurredAt` ISO string → `Date`, and re-validates ordering THROUGH `replayEvents` (a tampered
 * committed fixture fails LOUD before any insert). Read-only; the module import-bans the provider seam.
 */

function serializedRow(sequence: number, overrides: Partial<SerializedRow> = {}): SerializedRow {
  return {
    id: `evt-${sequence}`,
    runId: 'run-1',
    generationId: null,
    agenomeId: null,
    candidateId: null,
    type: 'run.started',
    sequence,
    occurredAt: new Date(1_700_000_000_000 + sequence * 1000).toISOString(),
    actor: 'runtime',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: {},
    schemaVersion: 2,
    ...overrides,
  };
}

function fixture(
  events: SerializedRow[],
  schemaVersion: number = CURRENT_SCHEMA_VERSION,
): SerializedReplayFixture {
  return { schemaVersion, runId: 'run-1', events };
}

const orderedEvents: SerializedRow[] = [
  serializedRow(0, { type: 'run.configured', payload: { rngSeed: 7 } }),
  serializedRow(1, { type: 'run.started' }),
  serializedRow(2, { type: 'run.completed', payload: { from: 'running', to: 'completed' } }),
];

describe('buildSeedPlan — PD.2 prepared-replay restore core (§17/§4)', () => {
  // spec(§4) — faithful restore: sequence/type/payload intact + occurredAt parsed ISO string → Date.
  test('build_seed_plan_preserves_rows', () => {
    const plan = buildSeedPlan(fixture(orderedEvents, 2));
    expect(plan.runId).toBe('run-1');
    expect(plan.rows.map((r) => r.sequence)).toEqual([0, 1, 2]);
    expect(plan.rows.map((r) => r.type)).toEqual([
      'run.configured',
      'run.started',
      'run.completed',
    ]);
    expect((plan.rows[0]!.payload as { rngSeed?: number }).rngSeed).toBe(7);
    // occurredAt deserialized to a Date, preserving the recorded instant exactly (LESSON 31 toJSON-aware).
    expect(plan.rows[0]!.occurredAt).toBeInstanceOf(Date);
    expect(plan.rows[0]!.occurredAt.toISOString()).toBe(orderedEvents[0]!.occurredAt);
  });

  // spec(§17) — re-record-not-upcast: a fixture schemaVersion > current fails fast with a re-record instruction.
  test('build_seed_plan_rejects_schema_too_new', () => {
    expect(() => buildSeedPlan(fixture(orderedEvents, CURRENT_SCHEMA_VERSION + 1))).toThrow(
      /re-record/i,
    );
  });

  // spec(§17) — schemaVersion == current (and an older value) is accepted (`≤ current` gate).
  test('build_seed_plan_accepts_schema_le_current', () => {
    expect(buildSeedPlan(fixture(orderedEvents, CURRENT_SCHEMA_VERSION)).rows).toHaveLength(3);
    expect(buildSeedPlan(fixture(orderedEvents, 1)).rows).toHaveLength(3);
  });

  // spec(§4) — validate-before-insert: a gapped/out-of-order fixture throws ReplayIntegrityError, no rows.
  test('build_seed_plan_rejects_corrupt_order', () => {
    const gapped = [serializedRow(0), serializedRow(2)]; // gap at 1
    expect(() => buildSeedPlan(fixture(gapped, 2))).toThrow(ReplayIntegrityError);
  });

  // spec(rule #2 / LESSON 46) — never seed a row that fails on read: an event passing replayEvents ordering
  // but failing the frozen RunEventEnvelope (bad type) OR validateEventPayload (bad high-traffic payload) throws.
  test('build_seed_plan_rejects_malformed_event', () => {
    // (a) envelope failure — a non-registry event type (RunEventEnvelope.type = RunEventType enum).
    const badType: SerializedRow[] = [
      serializedRow(0, { type: 'run.configured' }),
      serializedRow(1, { type: 'totally.bogus.type' }),
      serializedRow(2, { type: 'run.completed', payload: { from: 'running', to: 'completed' } }),
    ];
    expect(() => buildSeedPlan(fixture(badType, 2))).toThrow(/envelope validation/i);
    // (b) per-type payload failure — a high-traffic candidate.created with a malformed CandidateIdea payload.
    const badPayload: SerializedRow[] = [
      serializedRow(0, { type: 'run.configured' }),
      serializedRow(1, { type: 'candidate.created', payload: { not: 'a candidate' } }),
      serializedRow(2, { type: 'run.completed', payload: { from: 'running', to: 'completed' } }),
    ];
    expect(() => buildSeedPlan(fixture(badPayload, 2))).toThrow(/payload rejected/i);
  });

  // spec(security) — CALL-SITE guard: seedDemo REJECTS a traversal runId BEFORE any DB read/insert (pins the
  // assertSafeRunId invocation, not just its import — a dropped call would leave the import-ban green).
  test('seed_rejects_traversal_runId', async () => {
    const stubDb = {
      execute: () => Promise.reject(new Error('db-should-not-be-touched')),
    } as unknown as NodePgDatabase;
    await expect(seedDemo({ db: stubDb, dir: tmpdir(), runId: '../escape' })).rejects.toThrow(
      /unsafe runId/i,
    );
  });

  // spec(rule #7) — STRUCTURAL: the seed module imports NO provider/gateway/embedding/web seam (lesson 30/55).
  test('seed_imports_no_provider_seam', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/event-store/scripts/seed-demo.ts', import.meta.url)),
      'utf8',
    );
    const importLines = source
      .split('\n')
      .filter((line) => line.trimStart().startsWith('import'))
      .join('\n');
    expect(importLines).not.toMatch(
      /model-gateway|adapters\/|openai|embedding|retrieval|web-search|undici|node:https?/,
    );
    expect(source).not.toMatch(/fetch\(|Math\.random/);
  });
});
