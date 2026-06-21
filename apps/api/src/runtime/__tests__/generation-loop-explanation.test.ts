/**
 * Tests for explanation extraction in runGeneration → candidate.created event.
 *
 * Strategy: vi.mock the event-store/append module so runGeneration never
 * touches Postgres. We record every AppendEventInput and inspect the
 * candidate.created payload after driving one generation.
 */
import type { Agenome, ModelGatewayRequest, ModelGatewayResponse, RunCaps } from "@doppl/contracts";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import { createCapEnforcer, createKillSwitch } from "../caps.js";
import { runGeneration, type RunGenerationDeps, type RunGenerationInput } from "../generation-loop.js";
import { createSeededRng } from "../rng.js";

// ─── Mock appendEvent ────────────────────────────────────────────────────────
// Keep a test-local list that each test resets in beforeEach.
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

// ─── Shared test constants ───────────────────────────────────────────────────
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
    id: "ag_test_1",
    runId: "run_test",
    generationId: "gen_0",
    parentIds: [],
    systemPrompt: "You are a test agent.",
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

const BASE_INPUT: RunGenerationInput = {
  runId: "run_test",
  generationIndex: 0,
  agenomes: ONE_AGENOME,
  caps: CAPS,
  wallClockStartMs: Date.now(),
};

function makeGateway(outputJson: string): ModelGateway {
  return {
    invoke: async (_req: ModelGatewayRequest): Promise<ModelGatewayResponse> => ({
      ok: true,
      output: outputJson,
      repairAttempts: 0,
      energyEstimate: 1,
      energyActual: 1,
    }),
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

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("runGeneration — candidate.created carries explanation", () => {
  beforeEach(() => {
    capturedEvents.length = 0;
  });

  test("emits candidate.created with explanation when model JSON includes a non-empty explanation", async () => {
    const gateway = makeGateway(
      '{"subtype":"cross_domain_transfer","title":"X","summary":"Y","explanation":"In plain English: a clear analogy."}',
    );
    const deps = makeDeps(gateway);

    await runGeneration(deps, BASE_INPUT);

    const created = capturedEvents.find((e) => e.type === "candidate.created");
    expect(created).toBeDefined();
    const candidate = (created?.payload as { candidate: Record<string, unknown> }).candidate;
    expect(candidate.explanation).toBe("In plain English: a clear analogy.");
  });

  test("emits candidate.created WITHOUT explanation key when model JSON omits explanation", async () => {
    const gateway = makeGateway(
      '{"subtype":"cross_domain_transfer","title":"X","summary":"Y"}',
    );
    const deps = makeDeps(gateway);

    await runGeneration(deps, BASE_INPUT);

    const created = capturedEvents.find((e) => e.type === "candidate.created");
    expect(created).toBeDefined();
    const candidate = (created?.payload as { candidate: Record<string, unknown> }).candidate;
    expect(candidate.explanation).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(candidate, "explanation")).toBe(false);
  });
});
