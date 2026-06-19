import { describe, expect, test, vi } from "vitest";
import { createEnergyLedger } from "../energy-ledger.js";

// biome-ignore lint/suspicious/noExplicitAny: this is a fake envelope shape for unit tests; the real types live in @doppl/contracts
type FakeEnvelope = { type: any; payload: any };

function makeReplay(events: FakeEnvelope[]) {
  return {
    events(_runId: string) {
      return {
        async *[Symbol.asyncIterator]() {
          for (const e of events) yield e;
        },
      };
    },
  };
}

describe("createEnergyLedger — unit-level rebuild + estimate + reconcile", () => {
  test("rebuildFromEvents sums only energy.spent payloads (success-only invariant)", async () => {
    const replay = makeReplay([
      { type: "run.configured", payload: {} },
      { type: "energy.spent", payload: { energy: { actual: 40 } } },
      { type: "provider_call_failed", payload: {} },
      { type: "energy.spent", payload: { energy: { actual: 60 } } },
      { type: "output_schema_rejected", payload: {} },
    ]);
    const ledger = await createEnergyLedger({
      runId: "run_test",
      budget: 1000,
      replayReader: replay,
    });
    expect(ledger.current()).toBe(100);
  });

  test("estimateAllowed returns true when accumulator + estimate <= budget", async () => {
    const replay = makeReplay([{ type: "energy.spent", payload: { energy: { actual: 100 } } }]);
    const ledger = await createEnergyLedger({
      runId: "run_test",
      budget: 200,
      replayReader: replay,
    });
    expect(ledger.estimateAllowed(50)).toBe(true);
    expect(ledger.estimateAllowed(100)).toBe(true);
    expect(ledger.estimateAllowed(101)).toBe(false);
  });

  test("reconcile adds to the accumulator", async () => {
    const replay = makeReplay([{ type: "energy.spent", payload: { energy: { actual: 50 } } }]);
    const ledger = await createEnergyLedger({
      runId: "run_test",
      budget: 1000,
      replayReader: replay,
    });
    ledger.reconcile(25);
    expect(ledger.current()).toBe(75);
    ledger.reconcile(125);
    expect(ledger.current()).toBe(200);
  });

  test("fresh ledger with no events has accumulator 0", async () => {
    const replay = makeReplay([]);
    const ledger = await createEnergyLedger({
      runId: "run_test",
      budget: 1000,
      replayReader: replay,
    });
    expect(ledger.current()).toBe(0);
  });

  test("energy.spent payloads without an energy.actual field are skipped (defensive)", async () => {
    const replay = makeReplay([
      { type: "energy.spent", payload: { energy: { actual: 10 } } },
      // biome-ignore lint/suspicious/noExplicitAny: simulating a malformed event
      { type: "energy.spent", payload: {} as any },
    ]);
    const ledger = await createEnergyLedger({
      runId: "run_test",
      budget: 1000,
      replayReader: replay,
    });
    expect(ledger.current()).toBe(10);
  });
});
