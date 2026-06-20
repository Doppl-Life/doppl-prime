import { redact } from "@doppl/contracts";

/**
 * Structured kernel logger (P6.10). Emits one JSON record per call to
 * the supplied sink (default: stdout). Auto-propagates run / generation
 * / agenome / correlation IDs from the captured context. redact() runs
 * over the record before write so credentials cannot reach the sink.
 *
 * `withContext({ ... })` returns a child logger inheriting parent
 * context — useful for per-run / per-generation scoping.
 *
 * The logger is intentionally minimal: no log levels beyond
 * info/warn/error, no transports beyond a sink callback, no rotation.
 * Demo-grade observability per the spec language.
 */

export interface LogContext {
  runId?: string;
  generationId?: string;
  agenomeId?: string;
  correlationId?: string;
}

export type LogLevel = "info" | "warn" | "error";

export interface LogRecord {
  ts: string;
  level: LogLevel;
  msg: string;
  runId?: string;
  generationId?: string;
  agenomeId?: string;
  correlationId?: string;
  [extra: string]: unknown;
}

export interface KernelLogger {
  info(msg: string, extras?: Record<string, unknown>): void;
  warn(msg: string, extras?: Record<string, unknown>): void;
  error(msg: string, extras?: Record<string, unknown>): void;
  withContext(context: LogContext): KernelLogger;
}

export interface KernelLoggerOptions {
  context?: LogContext;
  sink?: (record: LogRecord) => void;
  /** Override `Date.now()` for deterministic tests. */
  now?: () => number;
}

function defaultSink(record: LogRecord): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function emitRecord(
  level: LogLevel,
  msg: string,
  context: LogContext,
  extras: Record<string, unknown> | undefined,
  sink: (record: LogRecord) => void,
  now: () => number,
): void {
  const raw: LogRecord = {
    ts: new Date(now()).toISOString(),
    level,
    msg,
    ...(context.runId !== undefined ? { runId: context.runId } : {}),
    ...(context.generationId !== undefined ? { generationId: context.generationId } : {}),
    ...(context.agenomeId !== undefined ? { agenomeId: context.agenomeId } : {}),
    ...(context.correlationId !== undefined ? { correlationId: context.correlationId } : {}),
    ...(extras ?? {}),
  };
  const scrubbed = redact(raw) as LogRecord;
  sink(scrubbed);
}

export function createKernelLogger(options: KernelLoggerOptions = {}): KernelLogger {
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? Date.now;
  const context: LogContext = options.context ?? {};

  const build = (ctx: LogContext): KernelLogger => ({
    info(msg, extras) {
      emitRecord("info", msg, ctx, extras, sink, now);
    },
    warn(msg, extras) {
      emitRecord("warn", msg, ctx, extras, sink, now);
    },
    error(msg, extras) {
      emitRecord("error", msg, ctx, extras, sink, now);
    },
    withContext(nextCtx) {
      return build({ ...ctx, ...nextCtx });
    },
  });

  return build(context);
}
