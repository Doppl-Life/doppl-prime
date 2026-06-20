import { describe, expect, test } from "vitest";
import * as api from "../index.js";

/**
 * Phase 6 §2.5 surface gate. Every Phase 6 export Phase 7 dashboard
 * will import from @doppl/api is listed here.
 */
const REQUIRED_PHASE_6_EXPORTS = [
  // Projections
  "buildProjection",
  "createWatermarkCache",
  "EMPTY_SEQUENCE_THROUGH",
  "ProjectionGapError",
  "buildCurrentState",
  "emptyState",
  "buildLineageGraph",
  "buildReplaySummary",
  "buildRunHealth",
  // Observability
  "createKernelLogger",
  "startHeartbeat",
  "DEFAULT_HEARTBEAT_INTERVAL_MS",
  // HTTP
  "createServer",
  "attachErrorHandler",
  "findIdempotencyResult",
  "hashBody",
  "recordIdempotencyResult",
  "createRunsWriteApp",
  "createRunsReadApp",
  "createHealthRouteApp",
  "createStreamRouteApp",
  "createModelRoutesApp",
  "nextEventsAfter",
  "getHeadSequence",
  "formatSseFrame",
] as const;

describe("spec(§2.5) Phase 6 surface", () => {
  for (const name of REQUIRED_PHASE_6_EXPORTS) {
    test(`exports ${name}`, () => {
      expect(api).toHaveProperty(name);
      expect((api as unknown as Record<string, unknown>)[name]).toBeDefined();
    });
  }
});
