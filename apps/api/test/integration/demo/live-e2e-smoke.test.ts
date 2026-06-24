import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { EnergyEvent, RunCaps } from '@doppl/contracts';
import {
  createEventStore,
  replayEvents,
  type EventStore,
  type RunEventRow,
} from '../../../src/event-store';
import { buildCurrentState, buildReplaySummary, canonicalize } from '../../../src/projections';
import { isRunTerminal } from '../../../src/runtime/worker/activeRunGuard';
import { dumpReplayToFile } from '../../../src/event-store/scripts/dump-replay';
import { bootApp } from '../../../src/main';
import { DEMO_FIXTURE_RUN_ID } from '../_support/recorded-demo-gateway';

/**
 * PD.8c — the PRIMARY/headline e2e demo smoke runs LIVE against real LLMs (USER DECISION, 2026-06-23).
 * `DOPPL_GATEWAY=live` + low caps → a forward run to `run.completed`, asserting the demo's safety/
 * correctness INVARIANTS hold on a non-deterministic live run (ARCHITECTURE.md §16/§17/§6/§5/§14/§10) —
 * terminal · caps (rule #1) · selected winner (PD.11 bridge) · energy success-only (rule #8) · no secret
 * leak (rule #4) — NEVER exact model text. The fixture is captured FROM the live run + replayed to keep
 * rule-#7 tested on the live-captured run. OPT-IN: the live suite `skipIf`s keyless so `/preflight` + CI
 * stay green with no keys and no live call (PD.8a `0245b46` is the keyless CI base + primary rule-#7
 * coverage). The invariant-assertion LOGIC is pinned deterministically (keyless) against the committed
 * recorded fixture below, so it is known-correct before the live path is ever run.
 */

// ---- live-gate ---------------------------------------------------------------------------------
/** Opt-in gate: the live suite runs only when a real OpenRouter key is present (non-blank). OPENAI is
 *  optional (novelty degrades without it; the run still terminals). */
function hasLiveKeys(): boolean {
  const k = process.env.OPENROUTER_API_KEY;
  return typeof k === 'string' && k.trim() !== '';
}

// ---- invariant extractors (shared by the keyless recorded-fixture check + the live suite) -------
/** The configured RunCaps from the run's `run.configured` payload (the recorded == executed ceiling). */
function configuredCaps(events: readonly RunEventRow[]): RunCaps | null {
  const configured = events.find((e) => e.type === 'run.configured');
  if (configured === undefined) return null;
  const caps = (configured.payload as { caps?: unknown }).caps;
  const parsed = RunCaps.safeParse(caps);
  return parsed.success ? parsed.data : null;
}

/** Generations actually run = distinct generationId among `generation.started`. */
function generationsRun(events: readonly RunEventRow[]): number {
  return new Set(events.filter((e) => e.type === 'generation.started').map((e) => e.generationId))
    .size;
}

/** Max population observed in any single generation = max `candidate.created` count per generationId. */
function maxPopulationObserved(events: readonly RunEventRow[]): number {
  const perGen = new Map<string | null, number>();
  for (const e of events) {
    if (e.type !== 'candidate.created') continue;
    perGen.set(e.generationId, (perGen.get(e.generationId) ?? 0) + 1);
  }
  return perGen.size === 0 ? 0 : Math.max(...perGen.values());
}

/** Total `doppl_energy` debited = sum of valid `energy.spent` EnergyEvent.actual. */
function totalEnergySpent(events: readonly RunEventRow[]): number {
  let total = 0;
  for (const e of events) {
    if (e.type !== 'energy.spent') continue;
    const parsed = EnergyEvent.safeParse(e.payload);
    if (parsed.success) total += parsed.data.actual;
  }
  return total;
}

/** Rule #8 — every `energy.spent` payload is a valid frozen EnergyEvent (eventType ∈ llm/tool/spawn; the
 *  schema has NO failure member, so a failed/retried/repaired call cannot have produced an energy debit). */
function allEnergySpentValid(events: readonly RunEventRow[]): boolean {
  const spent = events.filter((e) => e.type === 'energy.spent');
  return spent.every((e) => EnergyEvent.safeParse(e.payload).success);
}

/** The selected-winner candidate id (PD.11 bridge marks the run.completed.finalIdeaRef candidate). */
function selectedWinnerId(events: readonly RunEventRow[]): string | null {
  const { state } = buildCurrentState(events);
  const winner = Object.values(state.candidateIdeas).find((c) => c.status === 'selected');
  return winner?.id ?? null;
}

/** Rule #4 — does any (non-blank) secret VALUE appear in any persisted event payload? */
function secretValueLeaked(events: readonly RunEventRow[], secrets: readonly string[]): boolean {
  const present = secrets.filter((s) => s.length > 0);
  if (present.length === 0) return false;
  const serialized = JSON.stringify(events);
  return present.some((s) => serialized.includes(s));
}

// ---- keyless deterministic verification of the invariant LOGIC (runs in CI; no keys) ------------
const FIXTURE_PATH = fileURLToPath(
  new URL(`../../../../../fixtures/replay/${DEMO_FIXTURE_RUN_ID}.json`, import.meta.url),
);
function recordedFixtureRows(): RunEventRow[] {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as {
    events: ({ occurredAt: string } & Omit<RunEventRow, 'occurredAt'>)[];
  };
  return raw.events.map((e) => ({ ...e, occurredAt: new Date(e.occurredAt) }));
}

describe('PD.8c invariant logic — pinned deterministically on the committed recorded fixture (keyless)', () => {
  const rows = recordedFixtureRows();

  // spec(§5 rule #1) — caps-consumed ≤ configured for every dimension (the same check the live run uses).
  test('recorded_fixture_enforces_caps', () => {
    const caps = configuredCaps(rows);
    expect(caps).not.toBeNull();
    expect(generationsRun(rows)).toBeLessThanOrEqual(caps!.maxGenerations);
    expect(maxPopulationObserved(rows)).toBeLessThanOrEqual(caps!.maxPopulation);
    expect(totalEnergySpent(rows)).toBeLessThanOrEqual(caps!.energyBudget);
  });

  // spec(§5 rule #8) — every energy.spent is a valid success-only EnergyEvent (no failure member).
  test('recorded_fixture_energy_success_only', () => {
    expect(allEnergySpentValid(rows)).toBe(true);
  });

  // spec(§10/§12) — the selected winner resolves (the same PD.11-bridge check the live run uses).
  test('recorded_fixture_resolves_selected_winner', () => {
    expect(selectedWinnerId(rows)).not.toBeNull();
  });

  // spec(§14 rule #4) — the no-leak scan flags a planted secret AND clears the (secret-free) fixture.
  test('recorded_fixture_no_secret_leak_scan', () => {
    expect(secretValueLeaked(rows, ['or-placeholder-not-used', 'oai-placeholder-not-used'])).toBe(
      false,
    );
    // the scanner is not vacuous: a value that IS in the fixture is detected.
    const aRealId = rows[0]!.id;
    expect(secretValueLeaked(rows, [aRealId])).toBe(true);
  });
});

// ---- the LIVE headline smoke (opt-in; skips keyless so CI/preflight stay green) -----------------
let adminPool: pg.Pool;
let baseUri: string;
let dbCounter = 0;
let tmpDir: string;
const createdDbs: string[] = [];
const openPools: pg.Pool[] = [];

beforeAll(() => {
  baseUri = inject('pgConnectionUri');
  adminPool = new pg.Pool({ connectionString: baseUri });
  tmpDir = mkdtempSync(join(tmpdir(), 'doppl-live-'));
});

afterAll(async () => {
  while (openPools.length > 0) await openPools.pop()!.end();
  for (const name of createdDbs) {
    await adminPool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
  await adminPool.end();
  rmSync(tmpDir, { recursive: true, force: true });
});

async function freshDatabaseUrl(): Promise<string> {
  const name = `doppl_live_${dbCounter++}`;
  await adminPool.query(`CREATE DATABASE "${name}"`);
  createdDbs.push(name);
  const uri = new URL(baseUri);
  uri.pathname = `/${name}`;
  return uri.toString();
}

function probeStore(databaseUrl: string): EventStore {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  openPools.push(pool);
  return createEventStore({ db: drizzle(pool), secretValues: [] });
}

/** Live boot env: REAL keys (present when this suite runs) + DOPPL_GATEWAY=live + LOW caps (bounded cost/
 *  time, §16 10-min window): maxPopulation 3 · maxGenerations 2 · default energyBudget. */
function liveEnv(databaseUrl: string): Record<string, string | undefined> {
  return {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DATABASE_URL: databaseUrl,
    DOPPL_GATEWAY: 'live',
    DOPPL_MAX_POPULATION: '3',
    DOPPL_MAX_GENERATIONS: '2',
  };
}

function addressPort(server: { address: () => string | AddressInfo | null }): number {
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('server not listening on a port');
  return addr.port;
}

describe.skipIf(!hasLiveKeys())(
  'live e2e demo smoke — real LLMs, invariants on a forward run (opt-in; DOPPL_GATEWAY=live)',
  () => {
    let liveRows: RunEventRow[];
    let liveSecrets: string[];
    let capturedRows: RunEventRow[];
    let booted: Awaited<ReturnType<typeof bootApp>> | undefined;

    beforeAll(async () => {
      const url = await freshDatabaseUrl();
      liveSecrets = [
        process.env.OPENROUTER_API_KEY ?? '',
        process.env.OPENAI_API_KEY ?? '',
        url,
      ].filter((s) => s.length > 0);
      let settle!: () => void;
      const settled = new Promise<void>((r) => (settle = r));
      // No gateway override → bootApp resolves the REAL live gateway (createLiveGateway over env keys).
      booted = await bootApp({
        env: liveEnv(url),
        port: 0,
        host: '127.0.0.1',
        onSettled: () => settle(),
      });
      const res = await fetch(`http://127.0.0.1:${addressPort(booted!.app.server)}/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(201);
      const { runId } = (await res.json()) as { runId: string };
      await settled; // the live forward run drives to a terminal (real LLM calls).
      liveRows = await probeStore(url).readByRun(runId);
      // capture FROM the live run + read it back (transient temp fixture — the keyless CI base stays
      // the committed recorded fixture; a live capture is non-reproducible without keys + costs $).
      await dumpReplayToFile({ store: probeStore(url), runId, dir: tmpDir });
      const raw = JSON.parse(readFileSync(join(tmpDir, `${runId}.json`), 'utf8')) as {
        events: ({ occurredAt: string } & Omit<RunEventRow, 'occurredAt'>)[];
      };
      capturedRows = raw.events.map((e) => ({ ...e, occurredAt: new Date(e.occurredAt) }));
    }, 600_000);

    afterAll(async () => {
      await booted?.close();
    });

    // spec(§17/§16) — a live forward run reaches run.completed within the bounded window (INVARIANT).
    test('live_run_reaches_terminal', () => {
      expect(isRunTerminal(liveRows)).toBe(true);
      expect(liveRows.some((e) => e.type === 'run.completed')).toBe(true);
    });

    // spec(§5 rule #1) — caps-consumed ≤ configured for every dimension on the live run.
    test('live_run_enforces_caps', () => {
      const caps = configuredCaps(liveRows);
      expect(caps).not.toBeNull();
      expect(generationsRun(liveRows)).toBeLessThanOrEqual(caps!.maxGenerations);
      expect(maxPopulationObserved(liveRows)).toBeLessThanOrEqual(caps!.maxPopulation);
      expect(totalEnergySpent(liveRows)).toBeLessThanOrEqual(caps!.energyBudget);
    });

    // spec(§10/§12) — the live run resolves a status:'selected' winner (PD.11 bridge; non-empty surface).
    test('live_run_resolves_selected_winner', () => {
      expect(selectedWinnerId(liveRows)).not.toBeNull();
    });

    // spec(§5 rule #8) — energy success-only: every energy.spent is a valid EnergyEvent (no failure member).
    test('live_run_energy_success_only', () => {
      expect(allEnergySpentValid(liveRows)).toBe(true);
    });

    // spec(§14 rule #4) — no live key VALUE leaks into any persisted event (the scrub held on a live run).
    test('live_run_no_secret_leak', () => {
      expect(secretValueLeaked(liveRows, liveSecrets)).toBe(false);
      expect(secretValueLeaked(capturedRows, liveSecrets)).toBe(false); // nor in the captured fixture
    });

    // spec(§4/§16 rule #7) — capture FROM the live run replays state-equivalent, calling ZERO providers
    // (replay re-folds the persisted log; buildReplaySummary takes only events — no gateway).
    test('live_captured_fixture_replays_equivalent_no_provider', () => {
      expect(() => replayEvents(capturedRows)).not.toThrow();
      expect(canonicalize(buildCurrentState(capturedRows).state)).toBe(
        canonicalize(buildCurrentState(liveRows).state),
      );
      expect(canonicalize(buildReplaySummary(capturedRows).state)).toBe(
        canonicalize(buildCurrentState(capturedRows).state),
      );
    });
  },
);
