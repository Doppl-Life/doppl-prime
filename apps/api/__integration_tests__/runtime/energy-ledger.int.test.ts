import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../../src/event-store/append.js";
import { replayReader } from "../../src/event-store/replay-reader.js";
import { createEnergyLedger } from "../../src/runtime/energy-ledger.js";
import { type PgContainerHandle, startPgContainer } from "../helpers/pg-container.js";

describe("spec(§5) energy-ledger rebuild against real Postgres", () => {
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

  test("rebuilt accumulator equals SUM(energy.actual) over persisted energy.spent events", async () => {
    const runId = "run_energy_rebuild";
    // Append a representative mix of events.
    await appendEvent(db, {
      runId,
      type: "energy.spent",
      actor: "runtime",
      payload: {
        energy: {
          id: "e_1",
          runId,
          eventType: "llm",
          estimate: 10,
          actual: 10,
          unit: "doppl_energy",
          reason: "critic",
        },
      },
    });
    await appendEvent(db, {
      runId,
      type: "provider_call_failed",
      actor: "runtime",
      payload: { reason: "503 transient" },
    });
    await appendEvent(db, {
      runId,
      type: "energy.spent",
      actor: "runtime",
      payload: {
        energy: {
          id: "e_2",
          runId,
          eventType: "tool",
          estimate: 1,
          actual: 1,
          unit: "doppl_energy",
          reason: "retrieval",
        },
      },
    });
    await appendEvent(db, {
      runId,
      type: "output_schema_rejected",
      actor: "runtime",
      payload: { reason: "field missing" },
    });

    const ledger = await createEnergyLedger({
      runId,
      budget: 1000,
      replayReader: replayReader(db),
    });
    expect(ledger.current()).toBe(11); // 10 + 1, ignoring failure events
  });

  test("budget check uses the rebuilt accumulator", async () => {
    const runId = "run_energy_budget";
    await appendEvent(db, {
      runId,
      type: "energy.spent",
      actor: "runtime",
      payload: {
        energy: {
          id: "e_1",
          runId,
          eventType: "llm",
          estimate: 95,
          actual: 95,
          unit: "doppl_energy",
          reason: "x",
        },
      },
    });
    const ledger = await createEnergyLedger({
      runId,
      budget: 100,
      replayReader: replayReader(db),
    });
    expect(ledger.estimateAllowed(5)).toBe(true);
    expect(ledger.estimateAllowed(6)).toBe(false);
  });

  test("reconcile after gateway success updates the accumulator", async () => {
    const runId = "run_energy_reconcile";
    const ledger = await createEnergyLedger({
      runId,
      budget: 1000,
      replayReader: replayReader(db),
    });
    expect(ledger.current()).toBe(0);
    ledger.reconcile(42);
    expect(ledger.current()).toBe(42);
  });
});
