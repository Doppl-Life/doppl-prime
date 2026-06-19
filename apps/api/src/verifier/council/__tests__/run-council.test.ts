import type { CriticMandate, ModelGatewayRequest, ModelGatewayResponse } from "@doppl/contracts";
import { beforeEach, describe, expect, test } from "vitest";
import type { AppendEventInput, AppendEventResult } from "../../../event-store/append.js";
import type { ModelGateway } from "../../../model-gateway/gateway.js";
import { type CriticAssignment, runCouncil } from "../run-council.js";

const ALL_MANDATES: CriticMandate[] = [
  "factual_grounding",
  "novelty_prior_art",
  "feasibility",
  "falsification",
  "subtype_specific",
];

function makeFakeAppendEvent(): {
  fn: (e: AppendEventInput) => Promise<AppendEventResult>;
  events: AppendEventInput[];
} {
  const events: AppendEventInput[] = [];
  let seq = 0;
  return {
    fn: async (e) => {
      events.push(e);
      const result = { id: `evt_${seq}`, sequence: seq, occurredAt: new Date() };
      seq += 1;
      return result;
    },
    events,
  };
}

const VALID_REVIEW_OUTPUT = {
  scores: { grounding: 0.7 },
  critique: "Reasonable.",
  confidence: 0.6,
  evidenceRefs: [{ kind: "raw_output" as const, eventId: "evt_1" }],
};

const ALL_ACCEPT_GATEWAY: ModelGateway = {
  invoke: async (_req: ModelGatewayRequest): Promise<ModelGatewayResponse> => ({
    ok: true,
    output: VALID_REVIEW_OUTPUT,
    repairAttempts: 0,
    energyEstimate: 1,
  }),
};

const ASSIGNMENT: CriticAssignment = {
  factual_grounding: "crit_ag_fg",
  novelty_prior_art: "crit_ag_np",
  feasibility: "crit_ag_fe",
  falsification: "crit_ag_fa",
  subtype_specific: "crit_ag_ss",
};

const RUBRIC_BY_MANDATE: Record<CriticMandate, string> = {
  factual_grounding: "Score factual grounding.",
  novelty_prior_art: "Score novelty.",
  feasibility: "Score feasibility.",
  falsification: "Score falsification.",
  subtype_specific: "Score subtype-specific dims.",
};

describe("runCouncil — happy path", () => {
  let appender: ReturnType<typeof makeFakeAppendEvent>;
  beforeEach(() => {
    appender = makeFakeAppendEvent();
  });

  test("3 candidates × 5 mandates → 15 reviews + 15 critic.reviewed events", async () => {
    const candidates = [
      { candidateId: "cand_1", candidate: { summary: "one" } },
      { candidateId: "cand_2", candidate: { summary: "two" } },
      { candidateId: "cand_3", candidate: { summary: "three" } },
    ];
    const reviews = await runCouncil({
      gateway: ALL_ACCEPT_GATEWAY,
      appendEvent: appender.fn,
      candidates,
      criticAssignment: ASSIGNMENT,
      rubricByMandate: RUBRIC_BY_MANDATE,
      runId: "run_a",
      generationId: "gen_0",
      correlationIdFor: (c, m) => `corr_${c}_${m}`,
    });

    expect(reviews).toHaveLength(15);
    const types = appender.events.map((e) => e.type);
    expect(types.filter((t) => t === "critic.reviewed")).toHaveLength(15);
  });

  test("zero candidates → empty array, no events", async () => {
    const reviews = await runCouncil({
      gateway: ALL_ACCEPT_GATEWAY,
      appendEvent: appender.fn,
      candidates: [],
      criticAssignment: ASSIGNMENT,
      rubricByMandate: RUBRIC_BY_MANDATE,
      runId: "run_b",
      generationId: "gen_0",
      correlationIdFor: () => "corr",
    });
    expect(reviews).toEqual([]);
    expect(appender.events).toHaveLength(0);
  });

  test("all 5 mandates execute for each candidate, with the assigned critic agenome ID", async () => {
    const candidates = [{ candidateId: "cand_x", candidate: { summary: "x" } }];
    await runCouncil({
      gateway: ALL_ACCEPT_GATEWAY,
      appendEvent: appender.fn,
      candidates,
      criticAssignment: ASSIGNMENT,
      rubricByMandate: RUBRIC_BY_MANDATE,
      runId: "run_c",
      generationId: "gen_0",
      correlationIdFor: (c, m) => `corr_${c}_${m}`,
    });

    const agenomeIds = appender.events.map((e) => e.agenomeId).filter(Boolean);
    expect(new Set(agenomeIds)).toEqual(new Set(Object.values(ASSIGNMENT)));
  });

  test("mandates run in CriticMandateValues order per candidate", async () => {
    const candidates = [{ candidateId: "cand_only", candidate: { summary: "x" } }];
    await runCouncil({
      gateway: ALL_ACCEPT_GATEWAY,
      appendEvent: appender.fn,
      candidates,
      criticAssignment: ASSIGNMENT,
      rubricByMandate: RUBRIC_BY_MANDATE,
      runId: "run_d",
      generationId: "gen_0",
      correlationIdFor: (c, m) => `corr_${c}_${m}`,
    });
    const correlationIds = appender.events.map((e) => e.correlationId);
    const expected = ALL_MANDATES.map((m) => `corr_cand_only_${m}`);
    expect(correlationIds).toEqual(expected);
  });
});

describe("runCouncil — partial failure isolation", () => {
  let appender: ReturnType<typeof makeFakeAppendEvent>;
  beforeEach(() => {
    appender = makeFakeAppendEvent();
  });

  test("1 mandate rejects schema → 4 reviews + 1 output_schema_rejected (no fabrication)", async () => {
    // Each candidate sees: first 4 mandates accept; falsification mandate
    // returns a malformed payload on every call so pipeStructuredOutput
    // rejects after repair.
    const flakyGateway: ModelGateway = {
      invoke: async (req) => {
        // We can't read the mandate from the request directly — the
        // request input is opaque to the gateway. Use the correlationId
        // we propagated, which carries the mandate suffix.
        if (req.correlationId.includes("falsification")) {
          return {
            ok: true,
            output: { garbage: "not a critic review" },
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
      },
    };
    const candidates = [{ candidateId: "cand_p", candidate: { summary: "p" } }];
    const reviews = await runCouncil({
      gateway: flakyGateway,
      appendEvent: appender.fn,
      candidates,
      criticAssignment: ASSIGNMENT,
      rubricByMandate: RUBRIC_BY_MANDATE,
      runId: "run_p",
      generationId: "gen_0",
      correlationIdFor: (c, m) => `corr_${c}_${m}`,
    });

    expect(reviews).toHaveLength(4);
    const types = appender.events.map((e) => e.type);
    expect(types.filter((t) => t === "critic.reviewed")).toHaveLength(4);
    expect(types.filter((t) => t === "output_schema_rejected")).toHaveLength(1);
  });

  test("gateway throws on one mandate → review missing for that mandate, others persist", async () => {
    const flakyGateway: ModelGateway = {
      invoke: async (req) => {
        if (req.correlationId.includes("feasibility")) {
          throw new Error("provider down");
        }
        return {
          ok: true,
          output: VALID_REVIEW_OUTPUT,
          repairAttempts: 0,
          energyEstimate: 1,
        };
      },
    };
    const candidates = [{ candidateId: "cand_q", candidate: { summary: "q" } }];
    const reviews = await runCouncil({
      gateway: flakyGateway,
      appendEvent: appender.fn,
      candidates,
      criticAssignment: ASSIGNMENT,
      rubricByMandate: RUBRIC_BY_MANDATE,
      runId: "run_q",
      generationId: "gen_0",
      correlationIdFor: (c, m) => `corr_${c}_${m}`,
    });

    expect(reviews).toHaveLength(4);
    expect(reviews.every((r) => r.mandate !== "feasibility")).toBe(true);
  });
});

describe("runCouncil — return-type narrowness", () => {
  test("the return value is structurally CriticReview[] (no winner / no policy mutation)", async () => {
    const reviews = await runCouncil({
      gateway: ALL_ACCEPT_GATEWAY,
      appendEvent: makeFakeAppendEvent().fn,
      candidates: [{ candidateId: "cand_n", candidate: { summary: "n" } }],
      criticAssignment: ASSIGNMENT,
      rubricByMandate: RUBRIC_BY_MANDATE,
      runId: "run_n",
      generationId: "gen_0",
      correlationIdFor: (c, m) => `corr_${c}_${m}`,
    });
    expect(Array.isArray(reviews)).toBe(true);
    // The following lines would not compile if the return type widened:
    // @ts-expect-error CriticReview[] has no .winner field
    void reviews.winner;
    // @ts-expect-error CriticReview[] has no .scoringPolicy field
    void reviews.scoringPolicy;
  });
});
