import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { createRegistry, defaultRoutes } from "../src/model-gateway/default-routes.js";
import {
  type Adapter,
  type AdapterResult,
  type GatewayDeps,
  createGateway,
} from "../src/model-gateway/gateway.js";
import { createLangfuseClient } from "../src/model-gateway/langfuse.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

describe("spec(§4) gateway energy-event invariant (success-only)", () => {
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

  function makeGateway(adapter: Adapter) {
    const deps: GatewayDeps = {
      registry: createRegistry(defaultRoutes),
      adapterFor: () => adapter,
      eventStore: {
        appendEvent: (input) => appendEvent(db, input),
      },
      langfuse: createLangfuseClient({ env: {} }),
    };
    return createGateway(deps);
  }

  test("successful call → exactly one energy.spent in run_events; zero provider_call_failed", async () => {
    const result: AdapterResult = {
      rawOutput: { content: "ok" },
      energyEstimate: 10,
      energyActual: 9,
      providerTraceId: "trace_x",
    };
    const adapter: Adapter = { invoke: vi.fn(async () => result) };
    const gateway = makeGateway(adapter);

    await gateway.invoke({
      role: "critic",
      runId: "run_success",
      input: { prompt: "ok" },
      correlationId: "corr_1",
    });

    const energy = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id = 'run_success' AND type = 'energy.spent'`,
    );
    const failed = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id = 'run_success' AND type = 'provider_call_failed'`,
    );
    expect(energy.rows[0]?.count).toBe("1");
    expect(failed.rows[0]?.count).toBe("0");
  });

  test("primary AND fallback both fail → zero energy.spent + two provider_call_failed", async () => {
    const adapter: Adapter = {
      invoke: vi.fn(async () => {
        throw new Error("everything broken");
      }),
    };
    const gateway = makeGateway(adapter);

    await expect(
      gateway.invoke({
        role: "critic",
        runId: "run_both_fail",
        input: { prompt: "x" },
        correlationId: "corr_2",
      }),
    ).rejects.toThrow();

    const energy = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id = 'run_both_fail' AND type = 'energy.spent'`,
    );
    const failed = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id = 'run_both_fail' AND type = 'provider_call_failed'`,
    );
    expect(energy.rows[0]?.count).toBe("0");
    expect(failed.rows[0]?.count).toBe("2");
  });

  test("successful call after fallback → exactly one energy.spent with the fallback's actual", async () => {
    let calls = 0;
    const adapter: Adapter = {
      invoke: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("primary 503");
        return {
          rawOutput: { content: "fallback ok" },
          energyEstimate: 30,
          energyActual: 27,
        };
      }),
    };
    const gateway = makeGateway(adapter);

    await gateway.invoke({
      role: "critic",
      runId: "run_fallback_success",
      input: { prompt: "x" },
      correlationId: "corr_3",
    });

    const energy = await handle.pool.query<{ payload: { energy: { actual: number } } }>(
      `SELECT payload FROM run_events
       WHERE run_id = 'run_fallback_success' AND type = 'energy.spent'`,
    );
    expect(energy.rows).toHaveLength(1);
    expect(energy.rows[0]?.payload.energy.actual).toBe(27);

    const failed = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id = 'run_fallback_success' AND type = 'provider_call_failed'`,
    );
    expect(failed.rows[0]?.count).toBe("1");
  });

  test("ordering: provider_call_failed events appear BEFORE energy.spent on a fallback-success run", async () => {
    let calls = 0;
    const adapter: Adapter = {
      invoke: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("primary 503");
        return {
          rawOutput: { content: "ok" },
          energyEstimate: 10,
          energyActual: 9,
        };
      }),
    };
    const gateway = makeGateway(adapter);
    await gateway.invoke({
      role: "critic",
      runId: "run_order",
      input: { prompt: "x" },
      correlationId: "corr_4",
    });

    const rows = await handle.pool.query<{ type: string; sequence: string }>(
      `SELECT type, sequence FROM run_events WHERE run_id = 'run_order' ORDER BY sequence ASC`,
    );
    expect(rows.rows.map((r) => r.type)).toEqual(["provider_call_failed", "energy.spent"]);
  });
});
