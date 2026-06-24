import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { RunEventRow } from '../../../src/event-store/append';
import { ReplayIntegrityError } from '../../../src/event-store/replay-reader';
import { buildReplayFixture, dumpReplayToFile } from '../../../src/event-store/scripts/dump-replay';

/**
 * PD.1 dump-replay — pure `buildReplayFixture` core (ARCHITECTURE.md §16/§4, KEY SAFETY RULE #7). Guards
 * a run dump-eligible (terminal + non-empty), validates/orders THROUGH `replayEvents` (never re-sorts), and
 * pins the run's `schemaVersion`. A corrupt persisted log fails LOUD (`ReplayIntegrityError`) — never a
 * silently-resorted fixture. Read-only; the module import-bans the provider seam (rule #7 structural).
 */

function makeRow(sequence: number, overrides: Partial<RunEventRow> = {}): RunEventRow {
  return {
    id: `evt-${sequence}`,
    runId: 'run-1',
    generationId: null,
    agenomeId: null,
    candidateId: null,
    type: 'run.started',
    sequence,
    occurredAt: new Date(1_700_000_000_000 + sequence * 1000),
    actor: 'runtime',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: {},
    schemaVersion: 2,
    ...overrides,
  };
}

// A terminal run: configured(0) → started(1) → completed(2). The completed row carries a HIGHER
// schemaVersion to prove the pin selects the MAX (not the first / a fixed constant).
const terminalRun: RunEventRow[] = [
  makeRow(0, {
    type: 'run.configured',
    schemaVersion: 2,
    payload: { rngSeed: 7, outcome: [0.1, 0.2] },
  }),
  makeRow(1, { type: 'run.started', schemaVersion: 2 }),
  makeRow(2, {
    type: 'run.completed',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    payload: { from: 'running', to: 'completed' },
  }),
];

describe('buildReplayFixture — PD.1 prepared-replay dump core (§16/§4)', () => {
  // spec(§16/§4) — orders strictly-increasing-from-0 + pins schemaVersion = max(rows); payloads verbatim.
  test('build_fixture_orders_and_pins_schema_version', () => {
    const fixture = buildReplayFixture(terminalRun, 'run-1');
    expect(fixture.runId).toBe('run-1');
    expect(fixture.events.map((r) => r.sequence)).toEqual([0, 1, 2]); // strictly increasing from 0
    expect(fixture.schemaVersion).toBe(CURRENT_SCHEMA_VERSION); // MAX over the rows, not the first
    // replay-determinism inputs carried verbatim (RNG seed / outcomes serialized as-is).
    expect((fixture.events[0]!.payload as { rngSeed?: number }).rngSeed).toBe(7);
    expect((fixture.events[0]!.payload as { outcome?: number[] }).outcome).toEqual([0.1, 0.2]);
  });

  // spec(§16) — only a terminal run is dump-eligible: a non-terminal run throws (no fixture).
  test('build_fixture_rejects_non_terminal', () => {
    const nonTerminal = [
      makeRow(0, { type: 'run.configured' }),
      makeRow(1, { type: 'run.started' }),
    ];
    expect(() => buildReplayFixture(nonTerminal, 'run-1')).toThrow(/not terminal/i);
  });

  // spec(§4) — validate-not-sort: a gapped/out-of-order log throws ReplayIntegrityError (propagated from
  // replayEvents), never a silently-resorted fixture. Terminal (run.completed present) so it reaches replayEvents.
  test('build_fixture_rejects_corrupt_order', () => {
    const gapped = [
      makeRow(0, { type: 'run.configured' }),
      makeRow(2, { type: 'run.completed' }), // gap at 1
    ];
    expect(() => buildReplayFixture(gapped, 'run-1')).toThrow(ReplayIntegrityError);
  });

  // spec(no-empty-fixture) — an empty / unknown run throws a clear error, no fixture.
  test('build_fixture_rejects_empty', () => {
    expect(() => buildReplayFixture([], 'run-1')).toThrow(/no events/i);
  });

  // spec(security) — defense-in-depth: a runId carrying a path separator / traversal is rejected BEFORE any
  // read or write, so the artifact write can never escape the fixtures dir (the stub read must NOT run).
  test('dump_rejects_path_traversal_runid', async () => {
    const stubStore = { readByRun: () => Promise.reject(new Error('read-should-not-happen')) };
    await expect(
      dumpReplayToFile({ store: stubStore, runId: '../../escape', dir: tmpdir() }),
    ).rejects.toThrow(/unsafe runId/i);
  });

  // spec(rule #7) — STRUCTURAL: the dump module imports NO provider/gateway/embedding/web seam (lesson 30/55).
  // The provider-seam token list is checked against the IMPORT statements (so the module's own docstring prose
  // — "embedding", "web" — doesn't false-match); inline provider CALLS (fetch / Math.random) are banned over
  // the whole source (replay-determinism, §47/§55).
  test('dump_imports_no_provider_seam', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/event-store/scripts/dump-replay.ts', import.meta.url)),
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
