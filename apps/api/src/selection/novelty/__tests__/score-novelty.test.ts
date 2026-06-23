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
    const comparison: ComparisonEntry[] = [{ candidateId: "cand_1", vector: [1, 0, 0], text: "" }];
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
      { candidateId: "a", vector: [1, 0, 0], text: "" },
      { candidateId: "b", vector: [1, 0, 0], text: "" },
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

  test("score is mean cosine distance, scaled ×2 and clamped to [0,1]", async () => {
    // Target [1,0]; comparators [1,0] (dist 0) and [0,1] (dist 1) →
    // raw mean 0.5, scaled to 1.0 and clamped. The score-novelty
    // implementation rescales the OpenAI-embedding-observed range
    // (~[0, 0.5]) into the full [0, 1] so novelty actually contributes
    // to fitness instead of squashing into the bottom quartile.
    const gateway = makeGateway([1, 0]);
    const comparison: ComparisonEntry[] = [
      { candidateId: "a", vector: [1, 0], text: "" },
      { candidateId: "b", vector: [0, 1], text: "" },
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
    expect(out.noveltyScore.score).toBeCloseTo(1, 10);
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

describe("scoreCandidateNovelty — degrade path (U2)", () => {
  let appender: ReturnType<typeof makeFakeAppender>;
  beforeEach(() => {
    appender = makeFakeAppender();
  });

  test("embed fails twice (attempt + retry) → lexical fallback engages, novelty_scoring_degraded + novelty.scored both emitted", async () => {
    const failingGateway: ModelGateway = {
      invoke: async () => {
        throw new Error("provider down");
      },
    };
    const out = await scoreCandidateNovelty({
      gateway: failingGateway,
      appendEvent: appender.fn,
      candidateId: "cand_d1",
      candidateText: "the quick brown fox jumps over the lazy dog",
      runId: "run_d1",
      correlationId: "corr_d1",
      comparison: [],
      retryMax: 1,
    });

    expect(out.degraded).toBe(true);
    if (!out.degraded) return;
    expect(out.reason).toMatch(/embed_failed_after_retry/);

    const types = appender.events.map((e) => e.type);
    expect(types.filter((t) => t === "novelty_scoring_degraded")).toHaveLength(1);
    expect(types.filter((t) => t === "novelty.scored")).toHaveLength(1);

    expect(out.noveltyScore.method).toBe("lexical_char3gram_jaccard");
    expect(out.noveltyScore.embeddingModelId).toBe("lexical_char3gram_jaccard");
  });

  test("degrade with non-empty comparison computes Jaccard distance over text", async () => {
    const failingGateway: ModelGateway = {
      invoke: async () => {
        throw new Error("provider down");
      },
    };
    const out = await scoreCandidateNovelty({
      gateway: failingGateway,
      appendEvent: appender.fn,
      candidateId: "cand_d2",
      candidateText: "novel completely different idea",
      runId: "run_d2",
      correlationId: "corr_d2",
      comparison: [{ candidateId: "a", vector: [], text: "an entirely separate concept" }],
      retryMax: 0,
    });
    expect(out.degraded).toBe(true);
    // High Jaccard distance for low overlap text (close to 1, definitely > 0.5)
    expect(out.noveltyScore.score).toBeGreaterThan(0.5);
  });

  test("identical comparison text → degraded score = 0", async () => {
    const failingGateway: ModelGateway = {
      invoke: async () => {
        throw new Error("provider down");
      },
    };
    const text = "identical text";
    const out = await scoreCandidateNovelty({
      gateway: failingGateway,
      appendEvent: appender.fn,
      candidateId: "cand_d3",
      candidateText: text,
      runId: "run_d3",
      correlationId: "corr_d3",
      comparison: [{ candidateId: "a", vector: [], text }],
      retryMax: 0,
    });
    expect(out.degraded).toBe(true);
    expect(out.noveltyScore.score).toBe(0);
  });

  test("retry succeeds → no degrade, no novelty_scoring_degraded event", async () => {
    let attempts = 0;
    const flakyGateway: ModelGateway = {
      invoke: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("transient");
        return {
          ok: true,
          output: { vector: [1, 0, 0], embeddingModelId: "text-embedding-3-large", dimension: 3 },
          repairAttempts: 0,
          energyEstimate: 1,
        };
      },
    };
    const out = await scoreCandidateNovelty({
      gateway: flakyGateway,
      appendEvent: appender.fn,
      candidateId: "cand_d4",
      candidateText: "x",
      runId: "run_d4",
      correlationId: "corr_d4",
      comparison: [],
      retryMax: 1,
    });
    expect(out.degraded).toBe(false);
    expect(appender.events.some((e) => e.type === "novelty_scoring_degraded")).toBe(false);
  });

  test("malformed response also engages the degrade path", async () => {
    const malformedGateway: ModelGateway = {
      invoke: async () => ({
        ok: true,
        output: { vector: [1, 2, 3], embeddingModelId: "x" }, // missing dimension
        repairAttempts: 0,
        energyEstimate: 1,
      }),
    };
    const out = await scoreCandidateNovelty({
      gateway: malformedGateway,
      appendEvent: appender.fn,
      candidateId: "cand_d5",
      candidateText: "y",
      runId: "run_d5",
      correlationId: "corr_d5",
      comparison: [],
      retryMax: 0,
    });
    expect(out.degraded).toBe(true);
  });

  test("never-block: 3 candidates all degrade → 3 novelty_scoring_degraded + 3 novelty.scored, never throws", async () => {
    const failingGateway: ModelGateway = {
      invoke: async () => {
        throw new Error("down");
      },
    };
    for (const id of ["d6a", "d6b", "d6c"]) {
      const out = await scoreCandidateNovelty({
        gateway: failingGateway,
        appendEvent: appender.fn,
        candidateId: id,
        candidateText: `text ${id}`,
        runId: "run_d6",
        correlationId: `corr_${id}`,
        comparison: [],
        retryMax: 0,
      });
      expect(out.degraded).toBe(true);
    }
    const types = appender.events.map((e) => e.type);
    expect(types.filter((t) => t === "novelty_scoring_degraded")).toHaveLength(3);
    expect(types.filter((t) => t === "novelty.scored")).toHaveLength(3);
  });
});
