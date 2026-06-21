import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import { createEmitBoundary } from '../src/emit';

/**
 * P6.5 before-emit boundary (KEY SAFETY RULE #4, §14 / §13). The boundary scrubs every payload BEFORE
 * the injected emitter is called (an unscrubbed payload can't reach an emitter), and FAILS SAFE: a
 * failed export logs a local-only warning and writes NO entry to the authoritative log (Langfuse is
 * non-authoritative, §13). The emitter is INJECTED (L24 — run the real discipline, inject the IO);
 * P2.8 passes the real Langfuse client.
 */

const SECRET = 'S3cr3t-Langfuse-P4ss-xyz';

describe('createEmitBoundary — scrub-before-emit + fail-safe (spec §14 / §13)', () => {
  // 9 — the injected emitter receives a SCRUBBED payload; a secret in the input (value, key, or array
  // element) never reaches the emitter (before-emit reachability, rule #4). Positive-guarded.
  test('test_scrub_runs_before_emit', async () => {
    let received: unknown;
    const boundary = createEmitBoundary({
      secretValues: [SECRET],
      emit: (payload) => {
        received = payload;
      },
    });
    await boundary.emit({ blob: `raw ${SECRET}`, [SECRET]: 'as-key', arr: [SECRET] });
    expect(received).toBeDefined(); // positive guard so RED isn't vacuous
    expect(JSON.stringify(received)).not.toContain(SECRET);
  });

  // 10 — a failed export logs a local-only warning and writes NO authoritative-log entry (§13). The
  // boundary swallows the failure (does not reject), and structurally imports nothing from the event
  // store / DB, so it CANNOT append to the authoritative log.
  test('test_failed_export_local_warning_no_event_write', async () => {
    const warn = vi.fn();
    const boundary = createEmitBoundary({
      secretValues: [],
      emit: () => {
        throw new Error('langfuse export down');
      },
      warn,
    });
    await expect(boundary.emit({ msg: 'hello' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    const src = readFileSync(fileURLToPath(new URL('../src/emit.ts', import.meta.url)), 'utf8');
    const forbiddenImport = /from\s+['"][^'"]*(event-store|run_events|drizzle|\bpg\b|database)/i;
    expect(forbiddenImport.test(src)).toBe(false);
  });

  // 11 — structural: no credential is threaded into the emitted object. The emitter sees exactly the
  // scrubbed input (no apiKey/authorization/credential field added); `secretValues` are redaction
  // match-targets, never emitted.
  test('test_no_credential_threaded_into_emit', async () => {
    let received: unknown;
    const boundary = createEmitBoundary({
      secretValues: [SECRET],
      emit: (payload) => {
        received = payload;
      },
    });
    const input = { msg: 'clean trace', n: 1 };
    await boundary.emit(input);
    expect(received).toEqual(input);
    const serialized = JSON.stringify(received).toLowerCase();
    expect(serialized).not.toContain(SECRET.toLowerCase());
    expect(serialized).not.toContain('apikey');
    expect(serialized).not.toContain('authorization');
  });

  // §26 parity / §13 — a payload exceeding the frozen ceiling (here depth > 32) is DROPPED before the
  // recursive scrub: the emitter is never called, a local-only warning is logged, and the boundary
  // resolves (fail-safe — a pathological trace must not crash the run or stack-overflow the scrub).
  test('test_ceiling_exceeded_drops_trace_no_emit', async () => {
    const emit = vi.fn();
    const warn = vi.fn();
    const boundary = createEmitBoundary({ secretValues: [], emit, warn });
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 40; i++) {
      const next: Record<string, unknown> = {};
      cursor.child = next;
      cursor = next;
    }
    await expect(boundary.emit(deep)).resolves.toBeUndefined(); // fail-safe: no throw
    expect(emit).not.toHaveBeenCalled(); // trace dropped — never reaches the emitter
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
