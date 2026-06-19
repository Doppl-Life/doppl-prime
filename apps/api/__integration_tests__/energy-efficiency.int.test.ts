import { randomUUID } from "node:crypto";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { energyEfficiencyForAgenome } from "../src/selection/components/energy-efficiency.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

async function emitEnergySpent(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
  agenomeId: string | undefined,
  actual: number,
  estimate: number = actual,
): Promise<void> {
  await appendEvent(db, {
    runId,
    type: "energy.spent",
    actor: "runtime",
    payload: {
      energy: {
        id: randomUUID(),
        runId,
        ...(agenomeId !== undefined ? { agenomeId } : {}),
        eventType: "llm",
        estimate,
        actual,
        unit: "doppl_energy",
        reason: "test",
      },
    },
    ...(agenomeId !== undefined ? { agenomeId } : {}),
    correlationId: `corr_${randomUUID()}`,
  });
}

describe("spec(§8) energyEfficiencyForAgenome", () => {
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

  test("zero spend → returns 1.0 (boundary value)", async () => {
    const eff = await energyEfficiencyForAgenome({ db, runId: "run_z", agenomeId: "ag_z" });
    expect(eff).toBe(1.0);
  });

  test("single energy.spent of 10 → returns 1/11", async () => {
    await emitEnergySpent(db, "run_a", "ag_a", 10);
    const eff = await energyEfficiencyForAgenome({ db, runId: "run_a", agenomeId: "ag_a" });
    expect(eff).toBeCloseTo(1 / 11, 10);
  });

  test("multiple energy.spent events sum", async () => {
    await emitEnergySpent(db, "run_b", "ag_b", 10);
    await emitEnergySpent(db, "run_b", "ag_b", 5);
    const eff = await energyEfficiencyForAgenome({ db, runId: "run_b", agenomeId: "ag_b" });
    expect(eff).toBeCloseTo(1 / 16, 10);
  });

  test("only events matching agenomeId contribute", async () => {
    await emitEnergySpent(db, "run_c", "ag_target", 10);
    await emitEnergySpent(db, "run_c", "ag_other", 100);
    const eff = await energyEfficiencyForAgenome({ db, runId: "run_c", agenomeId: "ag_target" });
    expect(eff).toBeCloseTo(1 / 11, 10);
  });

  test("falls back to estimate when actual is missing", async () => {
    await appendEvent(db, {
      runId: "run_d",
      type: "energy.spent",
      actor: "runtime",
      payload: {
        energy: {
          id: randomUUID(),
          runId: "run_d",
          agenomeId: "ag_d",
          eventType: "llm",
          estimate: 7,
          actual: 7,
          unit: "doppl_energy",
          reason: "test",
        },
      },
      agenomeId: "ag_d",
      correlationId: "corr_d",
    });
    const eff = await energyEfficiencyForAgenome({ db, runId: "run_d", agenomeId: "ag_d" });
    expect(eff).toBeCloseTo(1 / 8, 10);
  });

  test("replay-stable: same persisted log returns the same value", async () => {
    await emitEnergySpent(db, "run_e", "ag_e", 3);
    await emitEnergySpent(db, "run_e", "ag_e", 7);
    const first = await energyEfficiencyForAgenome({ db, runId: "run_e", agenomeId: "ag_e" });
    const second = await energyEfficiencyForAgenome({ db, runId: "run_e", agenomeId: "ag_e" });
    expect(first).toBe(second);
  });

  test("agenome with no energy.spent for this run → 1.0", async () => {
    await emitEnergySpent(db, "run_f", "ag_other", 50);
    const eff = await energyEfficiencyForAgenome({ db, runId: "run_f", agenomeId: "ag_target" });
    expect(eff).toBe(1.0);
  });
});
