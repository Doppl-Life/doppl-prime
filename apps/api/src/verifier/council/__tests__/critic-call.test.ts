import type { ModelGatewayRequest, ModelGatewayResponse } from "@doppl/contracts";
import { beforeEach, describe, expect, test } from "vitest";
import type { AppendEventInput, AppendEventResult } from "../../../event-store/append.js";
import type { ModelGateway } from "../../../model-gateway/gateway.js";
import { criticCall } from "../critic-call.js";

interface CapturedEvent extends AppendEventInput {}

function makeFakeAppendEvent(): {
  fn: (e: AppendEventInput) => Promise<AppendEventResult>;
  events: CapturedEvent[];
} {
  const events: CapturedEvent[] = [];
  let seq = 0;
  return {
    fn: async (e) => {
      events.push(e);
      const result: AppendEventResult = {
        id: `evt_${seq}`,
        sequence: seq,
        occurredAt: new Date(),
      };
      seq += 1;
      return result;
    },
    events,
  };
}

function makeGateway(
  responses: (request: ModelGatewayRequest) => Promise<ModelGatewayResponse>,
): ModelGateway {
  return { invoke: responses };
}

const VALID_REVIEW_OUTPUT = {
  scores: { grounding: 0.7 },
  critique: "Reasonable evidence base.",
  confidence: 0.6,
  evidenceRefs: [{ kind: "raw_output", eventId: "evt_seed_1" }],
};

const BASE_INPUT = {
  mandate: "factual_grounding" as const,
  rubricTemplate: "Score factual grounding.",
  candidate: { id: "cand_1", summary: "Test summary" },
  candidateId: "cand_1",
  criticAgenomeId: "crit_ag_1",
  runId: "run_1",
  generationId: "gen_0",
  correlationId: "corr_1",
};

describe("criticCall — happy path", () => {
  let appender: ReturnType<typeof makeFakeAppendEvent>;
  beforeEach(() => {
    appender = makeFakeAppendEvent();
  });

  test("valid model output on first try → critic.reviewed event + ok review", async () => {
    const gateway = makeGateway(async () => ({
      ok: true,
      output: VALID_REVIEW_OUTPUT,
      repairAttempts: 0,
      energyEstimate: 1,
    }));

    const result = await criticCall({
      ...BASE_INPUT,
      gateway,
      appendEvent: appender.fn,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.candidateId).toBe("cand_1");
    expect(result.review.mandate).toBe("factual_grounding");
    expect(result.review.confidence).toBe(0.6);

    expect(appender.events).toHaveLength(1);
    const event = appender.events[0];
    if (!event) throw new Error("expected an appended event");
    expect(event.type).toBe("critic.reviewed");
    expect(event.actor).toBe("critic");
  });

  test("trusted metadata stamped by the helper — a model emitting a different candidateId is ignored", async () => {
    const malicious = {
      ...VALID_REVIEW_OUTPUT,
      // Strict schema strips extra fields like "candidateId" because the
      // model-output schema does not declare them. But even if the model
      // managed to smuggle them through, the helper overwrites with
      // input.candidateId on stamp.
    };
    const gateway = makeGateway(async () => ({
      ok: true,
      output: malicious,
      repairAttempts: 0,
      energyEstimate: 1,
    }));

    const result = await criticCall({
      ...BASE_INPUT,
      gateway,
      appendEvent: appender.fn,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.candidateId).toBe("cand_1");
  });

  test("the persisted critic.reviewed event carries the full CriticReview payload", async () => {
    const gateway = makeGateway(async () => ({
      ok: true,
      output: VALID_REVIEW_OUTPUT,
      repairAttempts: 0,
      energyEstimate: 1,
    }));

    await criticCall({ ...BASE_INPUT, gateway, appendEvent: appender.fn });

    const event = appender.events[0];
    if (!event) throw new Error("expected an appended event");
    const payload = event.payload as { review: { confidence: number; mandate: string } };
    expect(payload.review.confidence).toBe(0.6);
    expect(payload.review.mandate).toBe("factual_grounding");
  });
});

describe("criticCall — repair edge", () => {
  let appender: ReturnType<typeof makeFakeAppendEvent>;
  beforeEach(() => {
    appender = makeFakeAppendEvent();
  });

  test("structurally-broken first response + valid repair → critic.reviewed, ok review", async () => {
    let callCount = 0;
    const gateway = makeGateway(async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: true,
          output: { not: "a critic review" },
          repairAttempts: 0,
          energyEstimate: 1,
        };
      }
      return {
        ok: true,
        output: VALID_REVIEW_OUTPUT,
        repairAttempts: 0,
        energyEstimate: 1,
      };
    });

    const result = await criticCall({
      ...BASE_INPUT,
      gateway,
      appendEvent: appender.fn,
    });

    expect(result.ok).toBe(true);
    expect(callCount).toBe(2);
    const types = appender.events.map((e) => e.type);
    expect(types).toContain("critic.reviewed");
    expect(types).not.toContain("output_schema_rejected");
  });

  test("structurally-broken first AND repair → output_schema_rejected, schema_rejected reason", async () => {
    const gateway = makeGateway(async () => ({
      ok: true,
      output: { not: "a critic review" },
      repairAttempts: 0,
      energyEstimate: 1,
    }));

    const result = await criticCall({
      ...BASE_INPUT,
      gateway,
      appendEvent: appender.fn,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("schema_rejected");

    const types = appender.events.map((e) => e.type);
    expect(types).toContain("output_schema_rejected");
    expect(types).not.toContain("critic.reviewed");
  });
});

describe("criticCall — provider failure", () => {
  let appender: ReturnType<typeof makeFakeAppendEvent>;
  beforeEach(() => {
    appender = makeFakeAppendEvent();
  });

  test("gateway throws → return { ok: false, reason: provider_failed }, no critic.reviewed event", async () => {
    const gateway = makeGateway(async () => {
      throw new Error("provider unavailable");
    });

    const result = await criticCall({
      ...BASE_INPUT,
      gateway,
      appendEvent: appender.fn,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("provider_failed");
    const types = appender.events.map((e) => e.type);
    expect(types).not.toContain("critic.reviewed");
  });

  test("gateway returns ok:false → return { ok: false, reason: provider_failed }", async () => {
    const gateway = makeGateway(async () => ({
      ok: false,
      repairAttempts: 0,
      energyEstimate: 0,
      validationError: "downstream provider 500",
    }));

    const result = await criticCall({
      ...BASE_INPUT,
      gateway,
      appendEvent: appender.fn,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("provider_failed");
    expect(result.detail).toBe("downstream provider 500");
  });
});
