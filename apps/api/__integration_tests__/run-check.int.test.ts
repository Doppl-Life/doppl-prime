import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { buildCheckRegistry, defineCheckAdapter } from "../src/check-runners/registry.js";
import { runCheck } from "../src/check-runners/run-check.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

/**
 * Phase 4 U2: runCheck integration over Postgres. Every invocation
 * emits exactly one `check.completed` event; unregistered IDs and
 * adapter throws never silently pass — both produce schema-valid
 * CheckResults with a populated `skipReason` / `error` and the event
 * still fires.
 */

describe("spec(§7) runCheck — registry + event emission", () => {
  let handle: PgContainerHandle;
  let db: NodePgDatabase;

  beforeAll(async () => {
    handle = await startPgContainer();
    db = drizzle(handle.pool);
  });

  afterAll(async () => {
    await handle?.cleanup();
  });

  beforeEach(async () => {
    await handle.pool.query("TRUNCATE run_events");
  });

  test("happy path: registered adapter returns passed → one check.completed event with the result", async () => {
    const registry = buildCheckRegistry([
      defineCheckAdapter({
        id: "test.alpha",
        checkType: "test.alpha",
        description: "test alpha",
        fn: async () => ({
          checkType: "test.alpha",
          status: "passed",
          score: 0.8,
          evidenceRefs: [],
        }),
      }),
    ]);

    const result = await runCheck({
      db,
      registry,
      adapterId: "test.alpha",
      candidateId: "cand_001",
      candidate: { summary: "ok" },
      runId: "run_alpha",
      correlationId: "corr_alpha",
    });

    expect(result.status).toBe("passed");
    expect(result.score).toBe(0.8);
    expect(result.candidateId).toBe("cand_001");

    const rows = await handle.pool.query(
      "SELECT type, payload FROM run_events WHERE run_id = $1 ORDER BY sequence",
      ["run_alpha"],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].type).toBe("check.completed");
    const persistedResult = (rows.rows[0].payload as { result: { id: string; status: string } })
      .result;
    expect(persistedResult.id).toBe(result.id);
    expect(persistedResult.status).toBe("passed");
  });

  test("unregistered adapter → skipped + adapter_not_registered:<id> + check.completed", async () => {
    const registry = buildCheckRegistry([]);
    const result = await runCheck({
      db,
      registry,
      adapterId: "test.missing",
      candidateId: "cand_002",
      candidate: { summary: "ok" },
      runId: "run_missing",
      correlationId: "corr_missing",
    });

    expect(result.status).toBe("skipped");
    expect(result.skipReason).toBe("adapter_not_registered:test.missing");
    expect(result.checkType).toBe("unregistered");

    const rows = await handle.pool.query("SELECT type FROM run_events WHERE run_id = $1", [
      "run_missing",
    ]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].type).toBe("check.completed");
  });

  test("adapter fn throws → failed + error: <msg> + check.completed (no propagation)", async () => {
    const registry = buildCheckRegistry([
      defineCheckAdapter({
        id: "test.broken",
        checkType: "test.broken",
        description: "broken adapter",
        fn: async () => {
          throw new Error("adapter blew up");
        },
      }),
    ]);

    const result = await runCheck({
      db,
      registry,
      adapterId: "test.broken",
      candidateId: "cand_003",
      candidate: { summary: "ok" },
      runId: "run_broken",
      correlationId: "corr_broken",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("adapter blew up");

    const rows = await handle.pool.query("SELECT type FROM run_events WHERE run_id = $1", [
      "run_broken",
    ]);
    expect(rows.rows).toHaveLength(1);
  });

  test("adapter returns schema-invalid result → failed + validation error (no propagation, no fabrication)", async () => {
    const registry = buildCheckRegistry([
      defineCheckAdapter({
        id: "test.bad_result",
        checkType: "test.bad_result",
        description: "returns skipped without skipReason",
        fn: async () => ({
          checkType: "test.bad_result",
          status: "skipped",
          evidenceRefs: [],
          // missing skipReason — the refinement on CheckResult should reject this
        }),
      }),
    ]);

    const result = await runCheck({
      db,
      registry,
      adapterId: "test.bad_result",
      candidateId: "cand_004",
      candidate: { summary: "ok" },
      runId: "run_bad",
      correlationId: "corr_bad",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/skipReason/);

    const rows = await handle.pool.query("SELECT type FROM run_events WHERE run_id = $1", [
      "run_bad",
    ]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].type).toBe("check.completed");
  });

  test("ctx defaults to recorded mode when omitted", async () => {
    let observedMode: string | undefined;
    const registry = buildCheckRegistry([
      defineCheckAdapter({
        id: "test.ctx_probe",
        checkType: "test.ctx_probe",
        description: "probe ctx",
        fn: async (_input, ctx) => {
          observedMode = ctx.mode;
          return { checkType: "test.ctx_probe", status: "passed", evidenceRefs: [] };
        },
      }),
    ]);
    await runCheck({
      db,
      registry,
      adapterId: "test.ctx_probe",
      candidateId: "cand_005",
      candidate: {},
      runId: "run_ctx",
      correlationId: "corr_ctx",
    });
    expect(observedMode).toBe("recorded");
  });

  test("multiple runCheck calls on same registry produce independent check.completed events", async () => {
    const registry = buildCheckRegistry([
      defineCheckAdapter({
        id: "test.multi",
        checkType: "test.multi",
        description: "multi",
        fn: async () => ({ checkType: "test.multi", status: "passed", evidenceRefs: [] }),
      }),
    ]);

    for (let i = 0; i < 3; i += 1) {
      await runCheck({
        db,
        registry,
        adapterId: "test.multi",
        candidateId: `cand_multi_${i}`,
        candidate: {},
        runId: "run_multi",
        correlationId: `corr_multi_${i}`,
      });
    }

    const rows = await handle.pool.query(
      "SELECT COUNT(*) FROM run_events WHERE run_id = $1 AND type = 'check.completed'",
      ["run_multi"],
    );
    expect(Number(rows.rows[0].count)).toBe(3);
  });
});
