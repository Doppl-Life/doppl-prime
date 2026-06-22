import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION, RunEventEnvelope, validateEventPayload } from '@doppl/contracts';
import type {
  AppendInput,
  AppendResult,
  EventStore,
  RunEventRow,
} from '../../../../src/event-store';
import { scrubEventPayload } from '../../../../src/event-store';
import { crashForward } from '../../../../src/runtime/recovery/crashForward';

/**
 * P3.13 crash-forward recovery at boot (ARCHITECTURE.md §5 crash recovery + §3 legal terminal edges + §4
 * sequence). At boot, before the worker accepts work, forward-fail every orphaned NON-terminal run to its
 * §3-LEGAL crash terminal — running→run.failed{crash}, configured→run.cancelled{crash} (configured→failed
 * is illegal per P3.2, LESSONS §48). Never resumes; already-terminal untouched; idempotent + deterministic.
 */

const AppendEnvelope = RunEventEnvelope.omit({ sequence: true, occurredAt: true });

function makeFakeStore(seed: readonly AppendInput[] = []) {
  const rows: Array<AppendInput & { sequence: number }> = [];
  let seq = 0;
  const appendRaw = (input: AppendInput): AppendResult => {
    const parsed = AppendEnvelope.safeParse(input);
    if (!parsed.success) throw new Error(`fake append: invalid envelope (${input.type})`);
    const validated = validateEventPayload(input.type, input.payload);
    if (!validated.ok) throw new Error(`fake append: payload rejected (${input.type})`);
    const scrubbed = scrubEventPayload(validated.payload, []) as Record<string, unknown>;
    rows.push({ ...input, payload: scrubbed, sequence: seq });
    seq += 1;
    return { id: input.id, runId: input.runId, sequence: seq - 1 };
  };
  for (const s of seed) appendRaw(s);
  const store: EventStore = {
    append: async (input) => appendRaw(input),
    readByRun: async (runId) => rows.filter((r) => r.runId === runId) as unknown as RunEventRow[],
  };
  return {
    store,
    rows,
    typesFor: (runId: string) => rows.filter((r) => r.runId === runId).map((r) => r.type),
  };
}

// Per-status seeds (low-traffic generic payloads).
const configuredEvt = (runId: string): AppendInput => ({
  id: `${runId}-configured`,
  runId,
  type: 'run.configured',
  actor: 'operator',
  payload: {},
  schemaVersion: CURRENT_SCHEMA_VERSION,
});
const startedEvt = (runId: string): AppendInput => ({
  id: `${runId}-started`,
  runId,
  type: 'run.started',
  actor: 'runtime',
  payload: { from: 'configured', to: 'running' },
  schemaVersion: CURRENT_SCHEMA_VERSION,
});
const completedEvt = (runId: string): AppendInput => ({
  id: `${runId}-completed`,
  runId,
  type: 'run.completed',
  actor: 'runtime',
  payload: { from: 'running', to: 'completed' },
  schemaVersion: CURRENT_SCHEMA_VERSION,
});

// A running (started, no terminal), configured (never started), and a terminal run.
const runningSeed = (runId: string) => [configuredEvt(runId), startedEvt(runId)];
const configuredSeed = (runId: string) => [configuredEvt(runId)];
const terminalSeed = (runId: string) => [
  configuredEvt(runId),
  startedEvt(runId),
  completedEvt(runId),
];

const listing = (...ids: string[]) => ({ listRunIds: async () => ids });

describe('crashForward (P3.13 — forward-fail orphaned non-terminal runs at boot)', () => {
  // spec(§5:212) — a non-terminal running run → run.failed{reason:"crash"} + partial summary, running→failed.
  test('running_run_marked_failed_crash', async () => {
    const fake = makeFakeStore(runningSeed('r-run'));
    const result = await crashForward({ eventStore: fake.store, ...listing('r-run') });
    const failed = fake.rows.filter((r) => r.runId === 'r-run' && r.type === 'run.failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.payload).toMatchObject({ from: 'running', to: 'failed', reason: 'crash' });
    expect(failed[0]!.payload).toHaveProperty('partialSummary');
    expect(result.recovered).toHaveLength(1);
    expect(result.recovered[0]).toMatchObject({ runId: 'r-run', status: 'failed' });
  });

  // spec(§5 + P3.2/LESSONS §48) — a never-started configured run → run.cancelled{reason:"crash"} (the only
  // legal edge; configured→failed is illegal).
  test('configured_run_marked_cancelled_crash', async () => {
    const fake = makeFakeStore(configuredSeed('r-cfg'));
    await crashForward({ eventStore: fake.store, ...listing('r-cfg') });
    const cancelled = fake.rows.filter((r) => r.runId === 'r-cfg' && r.type === 'run.cancelled');
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]!.payload).toMatchObject({
      from: 'configured',
      to: 'cancelled',
      reason: 'crash',
    });
    // never run.failed (illegal configured→failed).
    expect(fake.rows.filter((r) => r.runId === 'r-cfg' && r.type === 'run.failed')).toHaveLength(0);
  });

  // spec(§5) — an already-terminal run is left untouched (idempotent skip).
  test('terminal_run_untouched', async () => {
    const fake = makeFakeStore(terminalSeed('r-term'));
    const before = fake.rows.length;
    const result = await crashForward({ eventStore: fake.store, ...listing('r-term') });
    expect(fake.rows.length).toBe(before); // no new event
    expect(result.recovered).toHaveLength(0);
  });

  // spec(§5) — a mix is recovered independently: the two non-terminal runs get their crash terminal; the
  // terminal one is untouched.
  test('multiple_runs_recovered_independently', async () => {
    const fake = makeFakeStore([
      ...terminalSeed('r-term'),
      ...runningSeed('r-run'),
      ...configuredSeed('r-cfg'),
    ]);
    const result = await crashForward({
      eventStore: fake.store,
      ...listing('r-term', 'r-run', 'r-cfg'),
    });
    expect(result.recovered.map((r) => r.runId).sort()).toEqual(['r-cfg', 'r-run']);
    expect(fake.typesFor('r-run')).toContain('run.failed');
    expect(fake.typesFor('r-cfg')).toContain('run.cancelled');
    expect(
      fake.typesFor('r-term').filter((t) => t === 'run.failed' || t === 'run.cancelled'),
    ).toHaveLength(0);
  });

  // spec(§5 no-resume) + rule #7 — crash-forward appends ONLY a run-terminal event: no generation/candidate
  // re-execution, no non-terminal lifecycle append; PURE (import-ban: no provider/store-write/RNG/clock).
  test('never_resumes_no_provider_no_nonterminal_event', async () => {
    const fake = makeFakeStore(runningSeed('r-run'));
    await crashForward({ eventStore: fake.store, ...listing('r-run') });
    // the ONLY new event (beyond the seed) is the run.failed terminal — nothing non-terminal appended.
    const newTypes = fake.rows.filter((r) => r.runId === 'r-run').map((r) => r.type);
    expect(newTypes).toEqual(['run.configured', 'run.started', 'run.failed']);

    const src = readFileSync(
      fileURLToPath(new URL('../../../../src/runtime/recovery/crashForward.ts', import.meta.url)),
      'utf8',
    );
    const importBan =
      /from\s+['"][^'"]*(model-gateway|gateway|openai|@anthropic|openrouter|embedding|retrieval|web-search|axios|node-fetch|undici|node:http)/i;
    expect(importBan.test(src)).toBe(false);
    expect(/Math\.random\s*\(/.test(src)).toBe(false);
    expect(/Date\.now\s*\(/.test(src)).toBe(false);
    expect(/\bfetch\s*\(/.test(src)).toBe(false);
  });

  // spec(§5 deterministic) + rule #7 — the same crashed-state log → byte-identical recovery events.
  test('deterministic_over_log', async () => {
    const a = makeFakeStore([...runningSeed('r-run'), ...configuredSeed('r-cfg')]);
    const b = makeFakeStore([...runningSeed('r-run'), ...configuredSeed('r-cfg')]);
    const ra = await crashForward({ eventStore: a.store, ...listing('r-run', 'r-cfg') });
    const rb = await crashForward({ eventStore: b.store, ...listing('r-run', 'r-cfg') });
    expect(JSON.stringify(ra.recovered)).toBe(JSON.stringify(rb.recovered));
    const appendedA = a.rows.filter((r) => r.type === 'run.failed' || r.type === 'run.cancelled');
    const appendedB = b.rows.filter((r) => r.type === 'run.failed' || r.type === 'run.cancelled');
    expect(
      JSON.stringify(appendedA.map((r) => ({ id: r.id, type: r.type, payload: r.payload }))),
    ).toBe(JSON.stringify(appendedB.map((r) => ({ id: r.id, type: r.type, payload: r.payload }))));
  });

  // idempotency — re-running crash-forward after recovery appends nothing (the terminal it wrote makes the
  // run terminal → skipped).
  test('idempotent_rerun_is_noop', async () => {
    const fake = makeFakeStore(runningSeed('r-run'));
    await crashForward({ eventStore: fake.store, ...listing('r-run') });
    const afterFirst = fake.rows.length;
    const second = await crashForward({ eventStore: fake.store, ...listing('r-run') });
    expect(fake.rows.length).toBe(afterFirst); // no new events
    expect(second.recovered).toHaveLength(0);
  });

  // spec(§5 + rule #2 + P3.2) — the crash terminal is appended through the P3.3 append path (sequence-
  // ordered) and runTerminalPath-validated (a legal edge); never a forced illegal transition.
  test('crash_terminal_guard_validated_via_append_path', async () => {
    const fake = makeFakeStore(runningSeed('r-run'));
    await crashForward({ eventStore: fake.store, ...listing('r-run') });
    const log = fake.rows.filter((r) => r.runId === 'r-run');
    const terminal = log.find((r) => r.type === 'run.failed')!;
    // appended via the store → it carries a per-run sequence, ABOVE the run.started it follows.
    const startedSeq = log.find((r) => r.type === 'run.started')!.sequence;
    expect(terminal.sequence).toBeGreaterThan(startedSeq);
    // the transition is a legal §3 edge (running→failed) — encoded in the payload.
    expect(terminal.payload).toMatchObject({ from: 'running', to: 'failed' });
  });
});
