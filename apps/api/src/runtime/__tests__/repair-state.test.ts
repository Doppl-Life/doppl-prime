import { randomUUID } from "node:crypto";
import type { StructuredOutputResult } from "@doppl/api/model-gateway";
import { describe, expect, test, vi } from "vitest";
import { handleStructuredOutput } from "../repair-state.js";
import { CandidateStateMachine } from "../state-machines/candidate.js";

interface EmittedEvent {
  type: string;
  payload: unknown;
}

function makeAppendEvent(events: EmittedEvent[]) {
  return vi.fn(async (input: { type: string; payload: unknown }) => {
    events.push({ type: input.type, payload: input.payload });
    return {
      id: randomUUID(),
      sequence: events.length - 1,
      occurredAt: new Date(),
    };
  });
}

const BASE_CTX = {
  candidateId: "cand_test",
  runId: "run_test",
  correlationId: "corr_test",
  role: "population_generator",
};

describe("handleStructuredOutput — first-try success", () => {
  test("ok=true, repairAttempts=0 → candidate goes created → under_review; no events emitted", async () => {
    const events: EmittedEvent[] = [];
    const result = await handleStructuredOutput({
      ...BASE_CTX,
      currentStatus: "created",
      result: {
        ok: true,
        output: { foo: "bar" },
        repairAttempts: 0,
      } satisfies StructuredOutputResult<unknown>,
      appendEvent: makeAppendEvent(events),
    });
    expect(result.nextStatus).toBe("under_review");
    expect(CandidateStateMachine.canTransition("created", result.nextStatus)).toBe(true);
    expect(events).toHaveLength(0);
  });
});

describe("handleStructuredOutput — repair-then-accept", () => {
  test("ok=true, repairAttempts=1 → candidate goes created → under_review directly; no extra events", async () => {
    const events: EmittedEvent[] = [];
    const result = await handleStructuredOutput({
      ...BASE_CTX,
      currentStatus: "created",
      result: {
        ok: true,
        output: { foo: "bar" },
        repairAttempts: 1,
      } satisfies StructuredOutputResult<unknown>,
      appendEvent: makeAppendEvent(events),
    });
    expect(result.nextStatus).toBe("under_review");
    // The successful-repair edge does NOT emit a kernel-side event — Phase 2
    // U4 already silently absorbed the repair, and the closed RunEventType
    // registry from Phase 0 does not include candidate.repairing.
    expect(events).toHaveLength(0);
  });
});

describe("handleStructuredOutput — repair failed → invalid", () => {
  test("ok=false, repairAttempts=1 → candidate goes created → invalid + emits candidate_invalidated", async () => {
    const events: EmittedEvent[] = [];
    const result = await handleStructuredOutput({
      ...BASE_CTX,
      currentStatus: "created",
      result: {
        ok: false,
        validationError: "missing field 'summary'",
        repairAttempts: 1,
      } satisfies StructuredOutputResult<unknown>,
      appendEvent: makeAppendEvent(events),
    });
    expect(result.nextStatus).toBe("invalid");

    const invalidated = events.filter((e) => e.type === "candidate_invalidated");
    expect(invalidated).toHaveLength(1);
    const payload = invalidated[0]?.payload as { candidateId: string; reason: string };
    expect(payload.candidateId).toBe(BASE_CTX.candidateId);
    expect(payload.reason).toContain("missing field");
  });

  test("the repair-failed path NEVER emits energy.spent (gateway's responsibility per Phase 2 U4)", async () => {
    const events: EmittedEvent[] = [];
    await handleStructuredOutput({
      ...BASE_CTX,
      currentStatus: "created",
      result: {
        ok: false,
        validationError: "x",
        repairAttempts: 1,
      } satisfies StructuredOutputResult<unknown>,
      appendEvent: makeAppendEvent(events),
    });
    const energy = events.filter((e) => e.type === "energy.spent");
    expect(energy).toHaveLength(0);
  });
});

describe("handleStructuredOutput — illegal source state", () => {
  test("currentStatus other than 'created' throws IllegalTransitionError", async () => {
    const events: EmittedEvent[] = [];
    await expect(
      handleStructuredOutput({
        ...BASE_CTX,
        currentStatus: "checked",
        result: {
          ok: true,
          output: {},
          repairAttempts: 0,
        } satisfies StructuredOutputResult<unknown>,
        appendEvent: makeAppendEvent(events),
      }),
    ).rejects.toThrow(/Candidate/);
  });
});
