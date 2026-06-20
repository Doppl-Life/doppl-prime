import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildReplaySummary } from "../../src/projections/replay-summary.js";
import { type RehearsalEnv, buildRecordedRun, startRehearsalEnv } from "./helpers.js";

/**
 * §16 demo path #4 — "Evidence walkthrough": after a completed run,
 * the operator walks the audience through the final-surviving-idea
 * proof panel. The 6 deep-link target IDs surfaced by the panel must
 * all resolve through the replay summary projection.
 *
 * The recorded run produced by buildRecordedRun is intentionally
 * minimal (5 events, no candidates). This rehearsal confirms the
 * structural plumbing: the replay-summary build pipeline accepts the
 * seeded run and produces a projection whose shape matches the
 * dashboard's expectation. The full evidence-resolver coverage lives
 * in evidence-resolver.int.test.ts (Phase 6).
 */

describe("rehearsal §16: evidence walkthrough projection plumbs cleanly", () => {
  let env: RehearsalEnv;

  beforeAll(async () => {
    env = await startRehearsalEnv();
  });
  afterAll(async () => {
    await env?.cleanup();
  });

  test("replay-summary projection builds against the recorded run", async () => {
    const { runId } = await buildRecordedRun(env);
    const summary = await buildReplaySummary({ db: env.db, runId });
    expect(summary.sequenceThrough).toBeGreaterThanOrEqual(0);
    expect(summary.summary).toBeDefined();
  });
});
