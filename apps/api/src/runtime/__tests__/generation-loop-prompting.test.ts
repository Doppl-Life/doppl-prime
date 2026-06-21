/**
 * Tests for problem-text + enabledSubtypes threading into the
 * population_generator gateway call. Mirrors the mocking pattern in
 * generation-loop-explanation.test.ts.
 */
import type { Agenome, ModelGatewayRequest, ModelGatewayResponse, RunCaps } from "@doppl/contracts";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import { createCapEnforcer, createKillSwitch } from "../caps.js";
import { runGeneration, type RunGenerationDeps, type RunGenerationInput } from "../generation-loop.js";
import { createSeededRng } from "../rng.js";

const capturedEvents: AppendEventInput[] = [];

vi.mock("../../event-store/append.js", () => ({
  appendEvent: vi.fn(async (
    _db: unknown,
    input: AppendEventInput,
  ): Promise<AppendEventResult> => {
    capturedEvents.push(input);
    return { id: randomUUID(), sequence: capturedEvents.length - 1, occurredAt: new Date() };
  }),
}));

const CAPS: RunCaps = {
  maxPopulation: 10,
  maxGenerations: 10,
  energyBudget: 100_000,
  maxSpawnDepth: 3,
  maxToolCalls: 50,
  wallClockTimeoutMs: 600_000,
};

const ONE_AGENOME: Agenome[] = [
  {
    id: "ag_prompting_1",
    runId: "run_prompting",
    generationId: "gen_0",
    parentIds: [],
    systemPrompt: "You are a test persona.",
    personaWeights: {
      boldness: 0.5,
      rigor: 0.5,
      curiosity: 0.5,
      originality: 0.5,
      integration: 0.5,
    },
    toolPermissions: [],
    decompositionPolicy: "test-policy",
    spawnBudget: 2,
    status: "seeded",
  },
];

function makeGateway(outputJson: string): {
  gateway: ModelGateway;
  calls: ModelGatewayRequest[];
} {
  const calls: ModelGatewayRequest[] = [];
  return {
    calls,
    gateway: {
      invoke: async (req: ModelGatewayRequest): Promise<ModelGatewayResponse> => {
        calls.push(req);
        return {
          ok: true,
          output: outputJson,
          repairAttempts: 0,
          energyEstimate: 1,
          energyActual: 1,
        };
      },
    },
  };
}

function makeDeps(gateway: ModelGateway): RunGenerationDeps {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: stub db never reaches postgres
    db: {} as any,
    gateway,
    killSwitch: createKillSwitch(),
    capEnforcer: createCapEnforcer(CAPS),
    ledger: { current: () => 0, estimateAllowed: () => true, reconcile: () => {} },
    rng: createSeededRng("test-seed"),
  };
}

const ZEITGEIST_INPUT: RunGenerationInput = {
  runId: "run_prompting",
  generationIndex: 0,
  agenomes: ONE_AGENOME,
  caps: CAPS,
  wallClockStartMs: Date.now(),
  enabledSubtypes: ["zeitgeist_synthesis"],
  problemText: "Synthesize three streams of discourse about agent-evolution at scale.",
};

describe("runGeneration — problem text and enabledSubtypes threading", () => {
  beforeEach(() => {
    capturedEvents.length = 0;
  });

  test("gateway gets a messages array with a system message (persona) and a user message that includes the problem text", async () => {
    const { gateway, calls } = makeGateway(
      '{"subtype":"zeitgeist_synthesis","title":"X","summary":"Y","explanation":"Z"}',
    );
    await runGeneration(makeDeps(gateway), ZEITGEIST_INPUT);

    expect(calls.length).toBeGreaterThan(0);
    const input = calls[0]?.input as { messages?: { role: string; content: string }[] };
    expect(input.messages).toBeDefined();
    expect(input.messages?.length).toBeGreaterThanOrEqual(2);
    const system = input.messages?.find((m) => m.role === "system");
    const user = input.messages?.find((m) => m.role === "user");
    expect(system?.content).toContain("You are a test persona.");
    expect(user?.content).toContain(
      "Synthesize three streams of discourse about agent-evolution at scale.",
    );
  });

  test("schemaForOutput.subtype.enum restricts to enabledSubtypes only", async () => {
    const { gateway, calls } = makeGateway(
      '{"subtype":"zeitgeist_synthesis","title":"X","summary":"Y","explanation":"Z"}',
    );
    await runGeneration(makeDeps(gateway), ZEITGEIST_INPUT);

    const schema = calls[0]?.schemaForOutput as {
      properties: { subtype: { enum: string[] } };
    };
    expect(schema.properties.subtype.enum).toEqual(["zeitgeist_synthesis"]);
  });

  test("candidate.created subtype falls back to enabledSubtypes[0] when the model omits the field", async () => {
    // Model response missing the `subtype` key — our parser should fall
    // back to the first allowed subtype, NOT to a hardcoded
    // cross_domain_transfer literal.
    const { gateway } = makeGateway('{"title":"X","summary":"Y","explanation":"Z"}');
    await runGeneration(makeDeps(gateway), ZEITGEIST_INPUT);

    const created = capturedEvents.find((e) => e.type === "candidate.created");
    expect(created).toBeDefined();
    const candidate = (created?.payload as { candidate: Record<string, unknown> }).candidate;
    expect(candidate.subtype).toBe("zeitgeist_synthesis");
  });

  test("schema includes zeitgeist payload fields when zeitgeist_synthesis is enabled", async () => {
    const { gateway, calls } = makeGateway(
      '{"subtype":"zeitgeist_synthesis","title":"X","summary":"Y","explanation":"Z"}',
    );
    await runGeneration(makeDeps(gateway), ZEITGEIST_INPUT);

    const schema = calls[0]?.schemaForOutput as {
      properties: Record<string, unknown>;
      required: string[];
    };
    // Cross-domain fields stay so a both-enabled run can still emit them;
    // zeitgeist fields are the new ones we're proving land in the schema.
    for (const key of [
      "thesis",
      "audience",
      "currentSignals",
      "whyNow",
      "falsifiablePredictions",
      "comparablePriorArt",
    ]) {
      expect(schema.properties[key]).toBeDefined();
      expect(schema.required).toContain(key);
    }
  });

  test("candidate.created emits a zeitgeist-shaped subtypePayload when the model returns a zeitgeist JSON", async () => {
    const { gateway } = makeGateway(
      JSON.stringify({
        subtype: "zeitgeist_synthesis",
        title: "Convergent automation pressure",
        summary: "Three discourse streams converge.",
        explanation: "All three discussions point at the same blind spot.",
        thesis: "Agent populations will compress the long tail.",
        audience: "ML platform leads",
        currentSignals: ["arxiv X", "blog Y", "podcast Z"],
        whyNow: "Compute curves crossed last quarter.",
        falsifiablePredictions: ["tail unchanged in 12 months"],
        comparablePriorArt: ["AlphaZero distill", "RLHF ladder"],
      }),
    );
    await runGeneration(makeDeps(gateway), ZEITGEIST_INPUT);

    const created = capturedEvents.find((e) => e.type === "candidate.created");
    expect(created).toBeDefined();
    const candidate = (created?.payload as { candidate: Record<string, unknown> }).candidate;
    expect(candidate.subtype).toBe("zeitgeist_synthesis");
    const payload = candidate.subtypePayload as Record<string, unknown>;
    expect(payload.thesis).toBe("Agent populations will compress the long tail.");
    expect(payload.audience).toBe("ML platform leads");
    expect(payload.currentSignals).toEqual(["arxiv X", "blog Y", "podcast Z"]);
    expect(payload.whyNow).toBe("Compute curves crossed last quarter.");
    expect(payload.falsifiablePredictions).toEqual(["tail unchanged in 12 months"]);
    expect(payload.comparablePriorArt).toEqual(["AlphaZero distill", "RLHF ladder"]);
    // The cross-domain fields must NOT leak into a zeitgeist payload.
    expect(payload.sourceDomain).toBeUndefined();
    expect(payload.transferMapping).toBeUndefined();
  });
});
