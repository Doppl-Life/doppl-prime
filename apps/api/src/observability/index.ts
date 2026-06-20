/**
 * Phase 6 observability public surface.
 */
export { createKernelLogger } from "./kernel-logger.js";
export type {
  KernelLogger,
  KernelLoggerOptions,
  LogContext,
  LogLevel,
  LogRecord,
} from "./kernel-logger.js";
export { DEFAULT_HEARTBEAT_INTERVAL_MS, startHeartbeat } from "./heartbeat.js";
export type { HeartbeatHandle, StartHeartbeatOptions } from "./heartbeat.js";
