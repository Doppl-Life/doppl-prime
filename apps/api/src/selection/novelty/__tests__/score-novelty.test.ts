import type { ModelGatewayRequest, ModelGatewayResponse } from "@doppl/contracts";
import { beforeEach, describe, expect, test } from "vitest";
import type { AppendEventInput, AppendEventResult } from "../../../event-store/append.js";
import type { ModelGateway } from "../../../model-gateway/gateway.js";
import { type ComparisonEntry, scoreCandidateNovelty } from "../score-novelty.js";

function makeFakeAppender(): {
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

function makeGateway(vector: number[], modelId = "text-embedding-3-large"): ModelGateway {
  return {
    invoke: async (_req: ModelGatewayRequest): Promise<ModelGatewayResponse> => ({
      ok: true,
      output: { vector, embeddingModelId: modelId, dimension: vector.length },
      repairAttempts: 0,
      energyEstimate: 1,
    }),
  };
}

describe("scoreCandidateNovelty — happy path", () => {
  let appender: ReturnType<typeof makeFakeAppender>;
  beforeEach(() => {
    appender = makeFakeAppender();
  });

  test("first candidate (empty comparison) → score 0, one novelty.scored event", async () => {
    const gateway = makeGateway([1, 0, 0]);
    const out = await scoreCandidateNovelty({
      gateway,
      appendEvent: appender.fn,
      candidateId: "cand_1",
      candidateText: "novel idea",
      runId: "run_n1",
      correlationId: "corr_n1",
      comparison: [],
    });
    expect(out.noveltyScore.score).toBe(0);
    expect(out.noveltyScore.comparisonSet).toEqual([]);
    expect(out.noveltyScore.method).toBe("embedding_cosine_mean");
    expect(out.noveltyScore.embeddingModelId).toBe("text-embedding-3-large");
    expect(appender.events).toHaveLength(1);
    expect(appender.events[0]?.type).toBe("novelty.scored");
    expect(appender.events[0]?.actor).toBe("selection_controller");
  });

  test("second candidate orthogonal to first → score 1", async () => {
    const gateway = makeGateway([0, 1, 0]);
    const comparison: ComparisonEntry[] = [{ candidateId: "cand_1", vector: [1, 0, 0] }];
    const out = await scoreCandidateNovelty({
      gateway,
      appendEvent: appender.fn,
      candidateId: "cand_2",
      candidateText: "different idea",
      runId: "run_n2",
      correlationId: "corr_n2",
      comparison,
    });
    expect(out.noveltyScore.score).toBeCloseTo(1, 10);
    expect(out.noveltyScore.comparisonSet).toEqual(["cand_1"]);
  });

  test("identical to all comparators → score 0", async () => {
    const gateway = makeGateway([1, 0, 0]);
    const comparison: ComparisonEntry[] = [
      { candidateId: "a", vector: [1, 0, 0] },
      { candidateId: "b", vector: [1, 0, 0] },
    ];
    const out = await scoreCandidateNovelty({
      gateway,
      appendEvent: appender.fn,
      candidateId: "cand_3",
      candidateText: "duplicate",
      runId: "run_n3",
      correlationId: "corr_n3",
      comparison,
    });
    expect(out.noveltyScore.score).toBeCloseTo(0, 10);
    expect(out.noveltyScore.comparisonSet).toEqual(["a", "b"]);
  });

  test("score is the mean of pairwise cosine distances", async () => {
    // Target [1,0]; comparators [1,0] (dist 0) and [0,1] (dist 1) → mean 0.5
    const gateway = makeGateway([1, 0]);
    const comparison: ComparisonEntry[] = [
      { candidateId: "a", vector: [1, 0] },
      { candidateId: "b", vector: [0, 1] },
    ];
    const out = await scoreCandidateNovelty({
      gateway,
      appendEvent: appender.fn,
      candidateId: "cand_4",
      candidateText: "x",
      runId: "run_n4",
      correlationId: "corr_n4",
      comparison,
    });
    expect(out.noveltyScore.score).toBeCloseTo(0.5, 10);
  });

  test("vector length equals dimension", async () => {
    const gateway = makeGateway([0.1, 0.2, 0.3, 0.4, 0.5]);
    const out = await scoreCandidateNovelty({
      gateway,
      appendEvent: appender.fn,
      candidateId: "cand_5",
      candidateText: "y",
      runId: "run_n5",
      correlationId: "corr_n5",
      comparison: [],
    });
    expect(out.noveltyScore.vector.length).toBe(out.noveltyScore.dimension);
  });

  test("persisted event payload carries the full NoveltyScore under payload.novelty", async () => {
    const gateway = makeGateway([1, 0, 0]);
    await scoreCandidateNovelty({
      gateway,
      appendEvent: appender.fn,
      candidateId: "cand_6",
      candidateText: "z",
      runId: "run_n6",
      correlationId: "corr_n6",
      comparison: [],
    });
    const event = appender.events[0];
    if (!event) throw new Error("no event");
    const payload = event.payload as { novelty: { candidateId: string } };
    expect(payload.novelty.candidateId).toBe("cand_6");
  });
});

describe("scoreCandidateNovelty — embed failure", () => {
  let appender: ReturnType<typeof makeFakeAppender>;
  beforeEach(() => {
    appender = makeFakeAppender();
  });

  test("gateway throws → EmbedError propagates, no novelty.scored event", async () => {
    const failingGateway: ModelGateway = {
      invoke: async () => {
        throw new Error("provider down");
      },
    };
    await expect(
      scoreCandidateNovelty({
        gateway: failingGateway,
        appendEvent: appender.fn,
        candidateId: "cand_f",
        candidateText: "x",
        runId: "run_f",
        correlationId: "corr_f",
        comparison: [],
      }),
    ).rejects.toThrow(/embed/i);
    expect(appender.events.find((e) => e.type === "novelty.scored")).toBeUndefined();
  });

  test("gateway returns ok:false → EmbedError, no event", async () => {
    const notOkGateway: ModelGateway = {
      invoke: async () => ({
        ok: false,
        repairAttempts: 0,
        energyEstimate: 0,
        validationError: "provider 500",
      }),
    };
    await expect(
      scoreCandidateNovelty({
        gateway: notOkGateway,
        appendEvent: appender.fn,
        candidateId: "cand_f2",
        candidateText: "x",
        runId: "run_f2",
        correlationId: "corr_f2",
        comparison: [],
      }),
    ).rejects.toThrow(/embed/i);
  });

  test("malformed embedding response (missing dimension) → EmbedError", async () => {
    const malformedGateway: ModelGateway = {
      invoke: async () => ({
        ok: true,
        output: { vector: [1, 2, 3], embeddingModelId: "x" },
        repairAttempts: 0,
        energyEstimate: 1,
      }),
    };
    await expect(
      scoreCandidateNovelty({
        gateway: malformedGateway,
        appendEvent: appender.fn,
        candidateId: "cand_f3",
        candidateText: "x",
        runId: "run_f3",
        correlationId: "corr_f3",
        comparison: [],
      }),
    ).rejects.toThrow(/dimension/i);
  });
});
