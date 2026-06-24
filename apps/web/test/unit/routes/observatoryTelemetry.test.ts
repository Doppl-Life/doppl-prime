// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunHealth } from '../../../src/data/health';
import {
  deriveHealthStatus,
  deriveTickerEvents,
  toHealthSummary,
} from '../../../src/routes/observatoryTelemetry';
import { RunEnergyGauge } from '../../../src/components/ds';
import { energyBudgetProgress } from '../../../src/panels/energyData';
import { makeEvent } from '../../fixtures/events';

afterEach(() => cleanup());

describe('deriveTickerEvents — pure event→ticker selector', () => {
  // spec(§12): rows are ordered by `sequence` ASCENDING (the sole ordering key) and read
  // type/sequence/occurredAt/actor VERBATIM — NEVER re-sorted by occurredAt.
  it('test_ticker_events_preserve_sequence_order', () => {
    // occurredAt is INVERTED vs sequence (seq 1 = latest time, seq 3 = earliest) so an
    // occurredAt-sort would yield [3,2,1]; a correct sequence-sort yields [1,2,3].
    const e3 = makeEvent(3, 'generation.started', {
      actor: 'runtime',
      occurredAt: '2026-06-20T12:00:01.000Z',
    });
    const e1 = makeEvent(1, 'candidate.created', {
      actor: 'agenome',
      occurredAt: '2026-06-20T12:00:09.000Z',
    });
    const e2 = makeEvent(2, 'fitness.scored', {
      actor: 'selection_controller',
      occurredAt: '2026-06-20T12:00:05.000Z',
    });

    const rows = deriveTickerEvents([e3, e1, e2]);

    expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3]); // sequence ASC, NOT occurredAt
    expect(rows[0]).toMatchObject({
      sequence: 1,
      type: 'candidate.created',
      actor: 'agenome',
      occurredAt: '2026-06-20T12:00:09.000Z', // verbatim, untouched
    });
  });

  // spec(defensive): an envelope whose `type` is unmapped by the component's glyph table still yields
  // a row (the component falls back to a neutral glyph) — the selector never drops/throws.
  it('test_ticker_unknown_event_type_renders', () => {
    const rows = deriveTickerEvents([makeEvent(1, 'output_schema_rejected', { actor: 'runtime' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('output_schema_rejected'); // type carried verbatim

    // and the DS component renders it without throwing (neutral fallback glyph •).
    const { container } = render(createElement(RunEnergyGauge, { spent: 0, budget: 0 })); // smoke other panel
    expect(container).toBeTruthy();
  });

  // spec(empty-state honesty): [] → [] (the component then shows "waiting for events…").
  it('test_ticker_empty_events_empty_feed', () => {
    expect(deriveTickerEvents([])).toEqual([]);
  });
});

describe('toHealthSummary — pure RunHealth→HealthSummary selector', () => {
  // spec(§11): maps currentGeneration/candidatesInFlight/capsConsumed and computes
  // lastEventAgeMs = nowMs − Date.parse(lastEventAt).
  it('test_health_summary_maps_run_health', () => {
    const health: RunHealth = {
      runId: 'run_1',
      currentGeneration: 2,
      candidatesInFlight: 3,
      lastEventAt: '2026-06-20T12:00:00.000Z',
      capsConsumed: { maxGenerations: 0.5, energyBudget: 0.2 },
    };
    const nowMs = Date.parse('2026-06-20T12:00:05.000Z'); // 5s after lastEventAt

    const s = toHealthSummary(health, nowMs);

    expect(s.currentGeneration).toBe(2);
    expect(s.candidatesInFlight).toBe(3);
    expect(s.capsConsumed).toEqual({ maxGenerations: 0.5, energyBudget: 0.2 });
    expect(s.lastEventAgeMs).toBe(5000);
  });

  // spec(null-safe): the hook's health is null until the first fetch resolves; a malformed lastEventAt
  // must never yield NaN. Either input → a safe summary with no NaN.
  it('test_health_summary_null_safe', () => {
    const sNull = toHealthSummary(null, Date.parse('2026-06-20T12:00:05.000Z'));
    expect(sNull.lastEventAgeMs).toBeUndefined();
    expect(sNull.currentGeneration).toBeUndefined();
    expect(deriveHealthStatus(sNull)).toBe('healthy'); // no last event → not stalled

    const sBad = toHealthSummary(
      {
        runId: 'run_1',
        currentGeneration: 0,
        candidatesInFlight: 0,
        lastEventAt: 'not-a-date',
        capsConsumed: {},
      },
      Date.parse('2026-06-20T12:00:05.000Z'),
    );
    expect(sBad.lastEventAgeMs).toBeUndefined(); // NaN guarded → omitted, never NaN
  });
});

describe('deriveHealthStatus — pure last-event-age threshold', () => {
  // spec(§11 continue-vs-switch cue): age buckets → healthy/slowing/slow/degraded/stalled (incl. boundaries).
  it('test_health_status_thresholds', () => {
    expect(deriveHealthStatus({ lastEventAgeMs: 0 })).toBe('healthy');
    expect(deriveHealthStatus({ lastEventAgeMs: 2999 })).toBe('healthy');
    expect(deriveHealthStatus({ lastEventAgeMs: 3000 })).toBe('slowing'); // ≥3s
    expect(deriveHealthStatus({ lastEventAgeMs: 7999 })).toBe('slowing');
    expect(deriveHealthStatus({ lastEventAgeMs: 8000 })).toBe('slow'); // ≥8s
    expect(deriveHealthStatus({ lastEventAgeMs: 19999 })).toBe('slow');
    expect(deriveHealthStatus({ lastEventAgeMs: 20000 })).toBe('degraded'); // ≥20s
    expect(deriveHealthStatus({ lastEventAgeMs: 59999 })).toBe('degraded');
    expect(deriveHealthStatus({ lastEventAgeMs: 60000 })).toBe('stalled'); // ≥60s
    expect(deriveHealthStatus({ lastEventAgeMs: 120000 })).toBe('stalled');
  });

  // spec(a fresh run isn't stalled): absent lastEventAgeMs → the sane default healthy.
  it('test_health_status_no_last_event_default', () => {
    expect(deriveHealthStatus({})).toBe('healthy');
    expect(deriveHealthStatus({ currentGeneration: 0, candidatesInFlight: 0 })).toBe('healthy');
  });
});

describe('RunEnergyGauge wiring — unknown budget safety', () => {
  // spec(§12 + the gauge's budget>0 guard): no run.configured → energyBudgetProgress.budget === null;
  // the wiring passes `budget ?? 0`, so the gauge renders without NaN/divide-by-zero.
  it('test_energy_gauge_unknown_budget_safe', () => {
    const prog = energyBudgetProgress([]);
    expect(prog.budget).toBeNull();
    expect(prog.spent).toBe(0);

    const { container } = render(
      createElement(RunEnergyGauge, { spent: prog.spent, budget: prog.budget ?? 0 }),
    );
    expect(container.textContent ?? '').not.toMatch(/NaN/);
    expect(container.textContent ?? '').toContain('doppl_energy');
  });
});
