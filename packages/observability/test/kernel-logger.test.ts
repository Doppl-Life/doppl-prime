import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { REDACTION_PLACEHOLDER } from '@doppl/contracts';
import { createKernelLogger, type KernelLogRecord } from '../src/kernel-logger';
import { createEmitBoundary } from '../src/emit';

/**
 * P6.10 — the structured kernel-logger (ARCHITECTURE.md §4/§13). It tags every record with the §4
 * envelope correlation IDs (runId + generationId?/agenomeId? + correlationId?) and writes to an
 * INJECTED sink (default console). A local sink write is NOT scrubbed (console is inside the process
 * trust boundary — LESSONS §32); any EXTERNAL emit routes through the REUSED `createEmitBoundary`
 * scrub (rule #4 / §28), never reimplemented. Structural pins: no event-store/append-path import
 * (rule #2) and no external metrics stack (§13 MVP — console + injected sink only).
 */

const FORBIDDEN_IMPORT = /from\s+['"][^'"]*(event-store|run_events|drizzle|\bpg\b|database)/i;
const METRICS_STACK_IMPORT =
  /from\s+['"][^'"]*(datadog|prom-client|prometheus|statsd|hot-shots|@opentelemetry)/i;
const SECRET = 'super-secret-token-1234';

describe('createKernelLogger — structured correlation-ID logger (spec §4 / §13)', () => {
  // §4 — every record carries runId (required) + generationId/agenomeId + correlationId from the
  // envelope. Positive guard (a record IS produced).
  test('test_kernel_logger_propagates_correlation_ids', () => {
    const records: KernelLogRecord[] = [];
    const logger = createKernelLogger({
      correlationIds: {
        runId: 'run_1',
        generationId: 'gen_2',
        agenomeId: 'agn_3',
        correlationId: 'corr_4',
      },
      sink: (record) => records.push(record),
    });
    logger.log({ message: 'generation advancing' });
    expect(records).toHaveLength(1); // positive guard so RED isn't vacuous
    const record = records[0]!;
    expect(record.runId).toBe('run_1');
    expect(record.generationId).toBe('gen_2');
    expect(record.agenomeId).toBe('agn_3');
    expect(record.correlationId).toBe('corr_4');
    expect(record.message).toBe('generation advancing');
  });

  // rule #4 / §28 — an EXTERNAL emit routes through createEmitBoundary (scrub-before-emit): an injected
  // secret VALUE is redacted in the emitted payload. The local sink path is NOT the external boundary
  // (console stays inside the process trust boundary, §32 — unscrubbed).
  test('test_external_emit_routes_through_scrub', async () => {
    let emitted: unknown;
    const localRecords: KernelLogRecord[] = [];
    const boundary = createEmitBoundary({
      secretValues: [SECRET],
      emit: (payload) => {
        emitted = payload;
      },
    });
    const logger = createKernelLogger({
      correlationIds: { runId: 'run_x' },
      sink: (record) => localRecords.push(record),
      boundary,
    });

    await logger.emitExternal({ message: 'external', fields: { detail: `token=${SECRET}` } });
    expect(emitted).toBeDefined(); // positive guard
    expect(JSON.stringify(emitted)).not.toContain(SECRET); // scrubbed BEFORE external emit (rule #4)
    expect(JSON.stringify(emitted)).toContain(REDACTION_PLACEHOLDER);

    // the local sink path does NOT scrub (process trust boundary — §32): the secret survives locally.
    logger.log({ message: 'local', fields: { detail: `token=${SECRET}` } });
    expect(JSON.stringify(localRecords)).toContain(SECRET);
  });

  // rule #2 — the kernel-logger imports nothing from the event-store writer / run_events (it never
  // mutates the authoritative log; a structured log is a side signal, not an authoritative event).
  test('test_no_append_path_import', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../src/kernel-logger.ts', import.meta.url)),
      'utf8',
    );
    expect(FORBIDDEN_IMPORT.test(src)).toBe(false);
  });

  // §13 MVP — sinks are console + an injected sink only; no external metrics stack is introduced.
  test('test_no_external_metrics_stack', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../src/kernel-logger.ts', import.meta.url)),
      'utf8',
    );
    expect(METRICS_STACK_IMPORT.test(src)).toBe(false);
  });
});
