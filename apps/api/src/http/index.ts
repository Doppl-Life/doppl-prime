/**
 * Phase 6 HTTP public surface.
 */
export { attachErrorHandler } from "./middleware/error.js";
export {
  findIdempotencyResult,
  hashBody,
  recordIdempotencyResult,
} from "./middleware/idempotency.js";
export type { StoredIdempotencyEntry } from "./middleware/idempotency.js";
export { createRunsWriteApp } from "./routes/runs-write.js";
export type { RunsWriteDeps } from "./routes/runs-write.js";
export { createRunsReadApp } from "./routes/runs-read.js";
export type { RunsReadDeps } from "./routes/runs-read.js";
export { createHealthRouteApp } from "./routes/health.js";
export type { HealthRouteDeps } from "./routes/health.js";
export { createStreamRouteApp, formatSseFrame } from "./routes/stream.js";
export type { StreamRouteDeps } from "./routes/stream.js";
export { createModelRoutesApp } from "./routes/model-routes.js";
export type { ModelRoutesDeps } from "./routes/model-routes.js";
export { nextEventsAfter, getHeadSequence } from "./sse/event-bridge.js";
export type { SerializedEvent, EventBridgeDeps } from "./sse/event-bridge.js";
export { createServer } from "./server.js";
export type { CreateServerDeps } from "./server.js";
