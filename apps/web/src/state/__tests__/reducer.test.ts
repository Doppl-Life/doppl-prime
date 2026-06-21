import { describe, expect, test } from "vitest";
import type { RunEventEnvelopeT } from "../../data/contracts.js";
import { ACTIVITY_EVENT_LOG_CAP, initialRunStoreState, runStoreReducer } from "../reducer.js";

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
  const base = {
    id: `evt_${overrides.sequence}`,
    runId: "run_x",
    actor: "runtime",
    occurredAt: "2026-06-19T00:00:00Z",
    schemaVersion: 1,
  };
  return { ...base, ...overrides } as RunEventEnvelopeT;
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

  test("candidate.created with explanation populates CandidateView.explanation", () => {
    const before = initialRunStoreState;
    const event = envelope({
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
          explanation: "In plain English: a clear analogy.",
          claims: [],
          evidenceRefs: [],
          status: "created",
          subtypePayload: {
            sourceDomain: "a",
            sourceTechnique: "b",
            targetDomain: "c",
            targetProblem: "d",
            transferMapping: "e",
            expectedMechanism: "f",
          },
        },
      },
      candidateId: "cand_1",
      agenomeId: "ag_1",
    });
    const after = runStoreReducer(before, { kind: "APPLY_EVENT", event });
    expect(after.candidates.cand_1?.explanation).toBe("In plain English: a clear analogy.");
  });

  test("candidate.created without explanation leaves CandidateView.explanation undefined", () => {
    const before = initialRunStoreState;
    const event = envelope({
      type: "candidate.created",
      sequence: 0,
      payload: {
        candidate: {
          id: "cand_2",
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
            sourceDomain: "a",
            sourceTechnique: "b",
            targetDomain: "c",
            targetProblem: "d",
            transferMapping: "e",
            expectedMechanism: "f",
          },
        },
      },
      candidateId: "cand_2",
      agenomeId: "ag_1",
    });
    const after = runStoreReducer(before, { kind: "APPLY_EVENT", event });
    expect(after.candidates.cand_2?.explanation).toBeUndefined();
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

  test("activity log: every applied event is appended with envelope-derived fields", () => {
    let state = runStoreReducer(initialRunStoreState, {
      kind: "APPLY_EVENT",
      event: envelope({
        type: "generation.started",
        sequence: 0,
        payload: { index: 0 },
        generationId: "gen_0",
      }),
    });
    state = runStoreReducer(state, {
      kind: "APPLY_EVENT",
      event: envelope({
        type: "energy.spent",
        sequence: 1,
        payload: { energy: { agenomeId: "ag_1", actual: 7, eventType: "llm" } },
        agenomeId: "ag_1",
      }),
    });
    expect(state.activityEventLog).toHaveLength(2);
    expect(state.activityEventLog[0]?.type).toBe("generation.started");
    expect(state.activityEventLog[0]?.generationId).toBe("gen_0");
    expect(state.activityEventLog[0]?.agenomeId).toBeUndefined();
    expect(state.activityEventLog[1]?.agenomeId).toBe("ag_1");
    expect(state.activityEventLog[1]?.actor).toBe("runtime");
  });

  test("activity log: idempotent re-apply does not double-append", () => {
    const event = envelope({
      type: "generation.started",
      sequence: 0,
      payload: { index: 0 },
      generationId: "gen_0",
    });
    const first = runStoreReducer(initialRunStoreState, { kind: "APPLY_EVENT", event });
    const second = runStoreReducer(first, { kind: "APPLY_EVENT", event });
    expect(first.activityEventLog).toHaveLength(1);
    expect(second.activityEventLog).toHaveLength(1);
    expect(second).toBe(first);
  });

  test(`activity log: capped at ACTIVITY_EVENT_LOG_CAP (=${ACTIVITY_EVENT_LOG_CAP}) — oldest dropped FIFO`, () => {
    let state = initialRunStoreState;
    const total = ACTIVITY_EVENT_LOG_CAP + 5;
    for (let i = 0; i < total; i++) {
      state = runStoreReducer(state, {
        kind: "APPLY_EVENT",
        event: envelope({
          type: "energy.spent",
          sequence: i,
          payload: { energy: { agenomeId: `ag_${i}`, actual: 1, eventType: "llm" } },
        }),
      });
    }
    expect(state.activityEventLog).toHaveLength(ACTIVITY_EVENT_LOG_CAP);
    expect(state.activityEventLog[0]?.sequence).toBe(5);
    expect(state.activityEventLog.at(-1)?.sequence).toBe(total - 1);
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

  test("SELECT_CANDIDATE bumps selectionEpoch even when re-selecting the same candidate", () => {
    const s1 = runStoreReducer(initialRunStoreState, {
      kind: "SELECT_CANDIDATE",
      candidateId: "cand_X",
      inspectorTab: "critics",
    });
    const s2 = runStoreReducer(s1, {
      kind: "SELECT_CANDIDATE",
      candidateId: "cand_X",
      inspectorTab: "evidence",
    });
    // candidateId is unchanged, but the epoch advances so the shell can
    // re-open the inspector for a second proof-link click.
    expect(s2.selection.candidateId).toBe("cand_X");
    expect(s2.selection.selectionEpoch).toBe((s1.selection.selectionEpoch ?? 0) + 1);
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

describe("runStoreReducer — selection mutual exclusion", () => {
  test("SELECT_AGENOME clears any prior candidateId", () => {
    const seeded = {
      ...initialRunStoreState,
      selection: {
        candidateId: "cand_x",
        agenomeId: null,
        inspectorTab: "overview" as const,
        selectionEpoch: 0,
      },
    };
    const next = runStoreReducer(seeded, {
      kind: "SELECT_AGENOME",
      agenomeId: "ag_1",
    });
    expect(next.selection.candidateId).toBeNull();
    expect(next.selection.agenomeId).toBe("ag_1");
  });

  test("SELECT_CANDIDATE clears any prior agenomeId", () => {
    const seeded = {
      ...initialRunStoreState,
      selection: {
        candidateId: null,
        agenomeId: "ag_1",
        inspectorTab: "overview" as const,
        selectionEpoch: 0,
      },
    };
    const next = runStoreReducer(seeded, {
      kind: "SELECT_CANDIDATE",
      candidateId: "cand_x",
    });
    expect(next.selection.agenomeId).toBeNull();
    expect(next.selection.candidateId).toBe("cand_x");
  });

  test("SELECT_AGENOME bumps selectionEpoch", () => {
    const seeded = {
      ...initialRunStoreState,
      selection: {
        candidateId: null,
        agenomeId: null,
        inspectorTab: "overview" as const,
        selectionEpoch: 4,
      },
    };
    const next = runStoreReducer(seeded, {
      kind: "SELECT_AGENOME",
      agenomeId: "ag_1",
    });
    expect(next.selection.selectionEpoch).toBe(5);
  });
});
