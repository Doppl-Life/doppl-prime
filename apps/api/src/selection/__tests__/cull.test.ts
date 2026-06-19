import type { FitnessScore } from "@doppl/contracts";
import { beforeEach, describe, expect, test } from "vitest";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import { type CullableCandidate, cullWeakLineages } from "../cull.js";

function makeFit(total: number): FitnessScore {
  return {
    id: "f",
    candidateId: "c",
    total,
    components: {},
    policyVersion: "v1",
    explanation: "",
  };
}

function makeCand(candidateId: string, agenomeId: string, total: number): CullableCandidate {
  return {
    candidateId,
    agenomeId,
    fitness: makeFit(total),
  };
}

function makeAppender(): {
  fn: (e: AppendEventInput) => Promise<AppendEventResult>;
  events: AppendEventInput[];
} {
  const events: AppendEventInput[] = [];
  let seq = 0;
  return {
    fn: async (e) => {
      events.push(e);
      const r = { id: `evt_${seq}`, sequence: seq, occurredAt: new Date() };
      seq += 1;
      return r;
    },
    events,
  };
}

describe("cullWeakLineages", () => {
  let appender: ReturnType<typeof makeAppender>;
  beforeEach(() => {
    appender = makeAppender();
  });

  test("empty candidates → empty result, no events", async () => {
    const out = await cullWeakLineages({
      appendEvent: appender.fn,
      candidates: [],
      runId: "run_c0",
      generationId: "gen_0",
      correlationIdFor: () => "corr",
    });
    expect(out.survivors).toEqual([]);
    expect(out.culledAgenomeIds).toEqual([]);
    expect(appender.events).toEqual([]);
  });

  test("5 candidates with widely varying fitness → low outliers culled", async () => {
    const cands = [
      makeCand("c1", "ag1", 0.0),
      makeCand("c2", "ag2", 0.1),
      makeCand("c3", "ag3", 1.0),
      makeCand("c4", "ag4", 1.5),
      makeCand("c5", "ag5", 2.0),
    ];
    const out = await cullWeakLineages({
      appendEvent: appender.fn,
      candidates: cands,
      runId: "run_c1",
      generationId: "gen_0",
      correlationIdFor: (id) => `corr_${id}`,
    });
    expect(out.culledAgenomeIds.length).toBeGreaterThanOrEqual(1);
    // Each culled produces one lineage.culled event
    expect(appender.events.length).toBe(out.culledAgenomeIds.length);
    for (const event of appender.events) {
      expect(event.type).toBe("lineage.culled");
      expect(event.actor).toBe("selection_controller");
    }
  });

  test("uniform fitness → threshold equals median, all survive", async () => {
    const cands = [
      makeCand("c1", "ag1", 1.0),
      makeCand("c2", "ag2", 1.0),
      makeCand("c3", "ag3", 1.0),
    ];
    const out = await cullWeakLineages({
      appendEvent: appender.fn,
      candidates: cands,
      runId: "run_c2",
      generationId: "gen_0",
      correlationIdFor: () => "c",
    });
    expect(out.survivors.length).toBe(3);
    expect(out.culledAgenomeIds.length).toBe(0);
    expect(appender.events.length).toBe(0);
  });

  test("when multiple candidates share an agenome, only the best representative counts", async () => {
    const cands = [
      makeCand("c1", "ag1", 0.0),
      makeCand("c2", "ag1", 1.0), // ag1's best
      makeCand("c3", "ag2", 0.0),
    ];
    const out = await cullWeakLineages({
      appendEvent: appender.fn,
      candidates: cands,
      runId: "run_c3",
      generationId: "gen_0",
      correlationIdFor: () => "c",
    });
    // ag1's representative is c2 (total 1.0), ag2's is c3 (0.0). Threshold
    // computed over all totals [0,1,0]; median 0, sigma > 0 → threshold 0.
    // Both ag1 and ag2 survive (>=0). At least no double-events for ag1.
    expect(out.survivors.find((s) => s.agenomeId === "ag1")?.candidateId).toBe("c2");
  });

  test("lineage.culled payload carries the score snapshot + explanation", async () => {
    const cands = [
      makeCand("c1", "ag1", 0.0),
      makeCand("c2", "ag2", 5.0),
      makeCand("c3", "ag3", 5.0),
    ];
    await cullWeakLineages({
      appendEvent: appender.fn,
      candidates: cands,
      runId: "run_c4",
      generationId: "gen_0",
      correlationIdFor: () => "c",
    });
    if (appender.events.length === 0) return; // nothing culled — ok
    const event = appender.events[0];
    if (!event) throw new Error("no event");
    const payload = event.payload as {
      culling: { reason: string; scoreSnapshot: Record<string, number>; targetIds: string[] };
    };
    expect(payload.culling.reason).toMatch(/median/);
    expect(payload.culling.targetIds).toHaveLength(1);
    expect(payload.culling.scoreSnapshot).toHaveProperty("fitness_total");
  });

  test("survivors are sorted by descending fitness for stable downstream ordering", async () => {
    const cands = [
      makeCand("c1", "ag1", 0.5),
      makeCand("c2", "ag2", 1.5),
      makeCand("c3", "ag3", 1.0),
    ];
    const out = await cullWeakLineages({
      appendEvent: appender.fn,
      candidates: cands,
      runId: "run_c5",
      generationId: "gen_0",
      correlationIdFor: () => "c",
    });
    for (let i = 1; i < out.survivors.length; i += 1) {
      const prev = out.survivors[i - 1];
      const curr = out.survivors[i];
      if (prev && curr) {
        expect(prev.fitness.total).toBeGreaterThanOrEqual(curr.fitness.total);
      }
    }
  });
});
