import { describe, expect, test } from "vitest";
import type { RunEventEnvelopeT } from "../../data/contracts.js";
import { initialRunStoreState, runStoreReducer } from "../reducer.js";

const VALID_CONFIG = {
  seed: "test-seed",
  enabledSubtypes: ["cross_domain_transfer"],
  caps: {
    maxPopulation: 4,
    maxGenerations: 3,
    energyBudget: 1_000,
    maxSpawnDepth: 2,
    maxToolCalls: 10,
    wallClockTimeoutMs: 60_000,
  },
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  rngSeed: "rng-1",
};

function envelope(
  overrides: Partial<RunEventEnvelopeT> & Pick<RunEventEnvelopeT, "type" | "sequence" | "payload">,
): RunEventEnvelopeT {
  return {
    id: `evt_${overrides.sequence}`,
    runId: "run_x",
    sequence: overrides.sequence,
    type: overrides.type,
    actor: "runtime",
    occurredAt: "2026-06-19T00:00:00Z",
    schemaVersion: 1,
    payload: overrides.payload,
    ...overrides,
  } as RunEventEnvelopeT;
}

describe("runStoreReducer — applyEvent", () => {
  test("empty state + run.configured → run row populated", () => {
    const next = runStoreReducer(initialRunStoreState, {
      kind: "APPLY_EVENT",
      event: envelope({
        type: "run.configured",
        sequence: 0,
        payload: { config: VALID_CONFIG },
      }),
    });
    expect(next.run?.id).toBe("run_x");
    expect(next.run?.status).toBe("configured");
    expect(next.run?.seed).toBe("test-seed");
    expect(next.sequenceThrough).toBe(0);
    expect(next.runId).toBe("run_x");
  });

  test("idempotent re-apply: same event twice → state unchanged", () => {
    const event = envelope({
      type: "run.configured",
      sequence: 0,
      payload: { config: VALID_CONFIG },
    });
    const first = runStoreReducer(initialRunStoreState, { kind: "APPLY_EVENT", event });
    const second = runStoreReducer(first, { kind: "APPLY_EVENT", event });
    expect(second).toBe(first);
  });

  test("out-of-order: event with sequence < sequenceThrough is dropped", () => {
    const s0 = runStoreReducer(initialRunStoreState, {
      kind: "APPLY_EVENT",
      event: envelope({
        type: "run.configured",
        sequence: 5,
        payload: { config: VALID_CONFIG },
      }),
    });
    const s1 = runStoreReducer(s0, {
      kind: "APPLY_EVENT",
      event: envelope({
        type: "generation.started",
        sequence: 3,
        payload: { index: 0 },
      }),
    });
    expect(s1).toBe(s0);
  });

  test("generation.started + generation.completed flips status", () => {
    let state = runStoreReducer(initialRunStoreState, {
      kind: "APPLY_EVENT",
      event: envelope({
        type: "generation.started",
        sequence: 0,
        payload: { index: 0 },
        generationId: "gen_0",
      }),
    });
    expect(state.generations.gen_0?.status).toBe("started");
    state = runStoreReducer(state, {
      kind: "APPLY_EVENT",
      event: envelope({
        type: "generation.completed",
        sequence: 1,
        payload: { completedAt: "2026-06-19T01:00:00Z", candidateCount: 3 },
        generationId: "gen_0",
      }),
    });
    expect(state.generations.gen_0?.status).toBe("completed");
    expect(state.generations.gen_0?.candidateCount).toBe(3);
  });

  test("candidate.created auto-creates the agenome", () => {
    const next = runStoreReducer(initialRunStoreState, {
      kind: "APPLY_EVENT",
      event: envelope({
        type: "candidate.created",
        sequence: 0,
        payload: {
          candidate: {
            id: "cand_1",
            runId: "run_x",
            generationId: "gen_0",
            agenomeId: "ag_1",
            subtype: "cross_domain_transfer",
            title: "T",
            summary: "S",
            claims: [],
            evidenceRefs: [],
            status: "created",
            subtypePayload: {
              sourceDomain: "biology",
              sourceTechnique: "selection",
              targetDomain: "ML",
              targetProblem: "x",
              transferMapping: "y",
              expectedMechanism: "z",
            },
          },
        },
        candidateId: "cand_1",
        agenomeId: "ag_1",
      }),
    });
    expect(next.candidates.cand_1?.summary).toBe("S");
    expect(next.agenomes.ag_1).toBeDefined();
    expect(next.capsConsumed.candidates).toBe(1);
  });

  test("failure events land in failureEvents log", () => {
    const next = runStoreReducer(initialRunStoreState, {
      kind: "APPLY_EVENT",
      event: envelope({
        type: "provider_call_failed",
        sequence: 0,
        payload: { reason: "503" },
      }),
    });
    expect(next.failureEvents).toHaveLength(1);
    expect(next.failureEvents[0]?.type).toBe("provider_call_failed");
  });

  test("energy.spent aggregates per agenome and updates capsConsumed", () => {
    let state = runStoreReducer(initialRunStoreState, {
      kind: "APPLY_EVENT",
      event: envelope({
        type: "energy.spent",
        sequence: 0,
        payload: {
          energy: { agenomeId: "ag_1", actual: 10, eventType: "llm" },
        },
      }),
    });
    state = runStoreReducer(state, {
      kind: "APPLY_EVENT",
      event: envelope({
        type: "energy.spent",
        sequence: 1,
        payload: {
          energy: { agenomeId: "ag_1", actual: 5, eventType: "tool" },
        },
      }),
    });
    expect(state.energySpend.ag_1).toBe(15);
    expect(state.capsConsumed.energy).toBe(15);
    expect(state.capsConsumed.toolCalls).toBe(1);
  });
});

describe("runStoreReducer — other actions", () => {
  test("SET_MODE updates mode", () => {
    const next = runStoreReducer(initialRunStoreState, {
      kind: "SET_MODE",
      mode: "live",
    });
    expect(next.mode).toBe("live");
  });

  test("SELECT_CANDIDATE sets selection.candidateId", () => {
    const next = runStoreReducer(initialRunStoreState, {
      kind: "SELECT_CANDIDATE",
      candidateId: "cand_X",
    });
    expect(next.selection.candidateId).toBe("cand_X");
  });

  test("RESET returns initial state", () => {
    const s0 = runStoreReducer(initialRunStoreState, {
      kind: "SET_MODE",
      mode: "live",
    });
    const reset = runStoreReducer(s0, { kind: "RESET" });
    expect(reset).toBe(initialRunStoreState);
  });

  test("RECORD_ERROR appends to errors", () => {
    const next = runStoreReducer(initialRunStoreState, {
      kind: "RECORD_ERROR",
      sequence: 5,
      type: "parse",
      message: "bad payload",
    });
    expect(next.errors).toHaveLength(1);
    expect(next.errors[0]?.message).toBe("bad payload");
  });
});
