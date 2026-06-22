import type { EmitBoundary } from './emit';

/**
 * P6.10 — the structured kernel-logger (ARCHITECTURE.md §4/§13). It tags every record with the §4
 * envelope correlation IDs (runId required + generationId?/agenomeId? + correlationId?) and writes to
 * an INJECTED sink (default a console sink). Two emit paths, two trust levels:
 *
 *   • `log(entry)` — LOCAL: write the structured record to the injected sink (console by default). This
 *     path is NOT scrubbed — console is inside the process trust boundary (LESSONS §32 precedent:
 *     `request.log.error` is outside the rule-#4 event-log/Langfuse/UI boundary). Secrets never reach
 *     the logger's input via the env-only structural guarantee anyway.
 *   • `emitExternal(entry)` — EXTERNAL: route the record through the injected `createEmitBoundary`
 *     (scrub-before-emit, rule #4 / §14) — REUSE the frozen LESSONS §28 boundary, never reimplement the
 *     scrub. With no boundary injected there is no external sink, so it is a no-op.
 *
 * This module imports nothing from the event-store writer / `run_events` (rule #2 — structural: a
 * structured log is a side signal, never an authoritative event; the closed 36-member RunEventType has
 * no log member) and introduces no external metrics stack (§13 MVP — console + injected sink only). The
 * live-worker loop that drives it wires at P3/integration (the worker doesn't exist on the demo fork).
 */
export interface CorrelationIds {
  /** Always present — the run the record belongs to (§4 envelope). */
  runId: string;
  generationId?: string;
  agenomeId?: string;
  correlationId?: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level?: LogLevel;
  message: string;
  fields?: Record<string, unknown>;
}

/** A structured log record: the correlation IDs + level + message + optional structured fields. */
export interface KernelLogRecord {
  level: LogLevel;
  message: string;
  runId: string;
  generationId?: string;
  agenomeId?: string;
  correlationId?: string;
  fields?: Record<string, unknown>;
}

export type KernelLogSink = (record: KernelLogRecord) => void;

export interface KernelLoggerDeps {
  /** §4 correlation IDs stamped into every record. */
  correlationIds: CorrelationIds;
  /** Injected local sink (default = a console sink). NOT scrubbed (§32 process trust boundary). */
  sink?: KernelLogSink;
  /** Injected external boundary (createEmitBoundary) — scrub-before-emit for any external sink (rule #4). */
  boundary?: EmitBoundary;
}

export interface KernelLogger {
  /** Write the record to the local sink (console by default; not scrubbed — §32). */
  log(entry: LogEntry): void;
  /** Route the record through the injected scrub boundary before any external emit (rule #4). */
  emitExternal(entry: LogEntry): Promise<void>;
}

/** Default local sink — structured one-line JSON to stdout (inside the process trust boundary, §32). */
const defaultSink: KernelLogSink = (record) => {
  console.log(JSON.stringify(record));
};

/** Build a record by stamping the correlation IDs onto the entry (optional ids omitted when absent). */
function buildRecord(correlationIds: CorrelationIds, entry: LogEntry): KernelLogRecord {
  return {
    level: entry.level ?? 'info',
    message: entry.message,
    runId: correlationIds.runId,
    ...(correlationIds.generationId !== undefined
      ? { generationId: correlationIds.generationId }
      : {}),
    ...(correlationIds.agenomeId !== undefined ? { agenomeId: correlationIds.agenomeId } : {}),
    ...(correlationIds.correlationId !== undefined
      ? { correlationId: correlationIds.correlationId }
      : {}),
    ...(entry.fields !== undefined ? { fields: entry.fields } : {}),
  };
}

export function createKernelLogger(deps: KernelLoggerDeps): KernelLogger {
  const sink = deps.sink ?? defaultSink;
  return {
    log(entry: LogEntry): void {
      sink(buildRecord(deps.correlationIds, entry));
    },
    async emitExternal(entry: LogEntry): Promise<void> {
      // No boundary → no external sink configured → nothing leaves the process.
      await deps.boundary?.emit(buildRecord(deps.correlationIds, entry));
    },
  };
}
