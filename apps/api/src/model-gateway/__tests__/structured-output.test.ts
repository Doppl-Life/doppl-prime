import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { type StructuredOutputContext, pipeStructuredOutput } from "../structured-output.js";

interface EmittedEvent {
  type: string;
  payload: unknown;
}

const ResponseSchema = z
  .object({
    summary: z.string(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

function makeCtx(events: EmittedEvent[] = []): StructuredOutputContext {
  return {
    appendEvent: async (input) => {
      events.push({ type: input.type, payload: input.payload });
      return {
        id: randomUUID(),
        sequence: events.length - 1,
        occurredAt: new Date(),
      };
    },
    runId: "run_test",
    correlationId: "corr_test",
    role: "critic",
    routeId: "openrouter:anthropic/claude-3.5-sonnet",
  };
}

describe("pipeStructuredOutput — happy path", () => {
  test("first-try valid output → ok=true, repairAttempts=0; repair never called", async () => {
    const repair = vi.fn(async () => ({ summary: "should not", confidence: 0 }));
    const events: EmittedEvent[] = [];
    const result = await pipeStructuredOutput({
      raw: { summary: "ok", confidence: 0.8 },
      schema: ResponseSchema,
      repair,
      ctx: makeCtx(events),
    });
    expect(result).toEqual({
      ok: true,
      output: { summary: "ok", confidence: 0.8 },
      repairAttempts: 0,
    });
    expect(repair).toHaveBeenCalledTimes(0);
    expect(events).toHaveLength(0);
  });
});

describe("pipeStructuredOutput — repair-then-accept", () => {
  test("first-try invalid, repair returns valid → ok=true, repairAttempts=1; no rejection event", async () => {
    const repair = vi.fn(async () => ({ summary: "fixed", confidence: 0.5 }));
    const events: EmittedEvent[] = [];
    const result = await pipeStructuredOutput({
      raw: { summary: "ok" }, // missing confidence
      schema: ResponseSchema,
      repair,
      ctx: makeCtx(events),
    });
    expect(result.ok).toBe(true);
    expect(result.repairAttempts).toBe(1);
    if (result.ok === true) {
      expect(result.output).toEqual({ summary: "fixed", confidence: 0.5 });
    }
    expect(repair).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.type === "output_schema_rejected")).toHaveLength(0);
  });
});

describe("pipeStructuredOutput — repair fails to fix", () => {
  test("first-try invalid, repair also invalid → ok=false + appendEvent(output_schema_rejected)", async () => {
    const repair = vi.fn(async () => ({ summary: "still wrong", confidence: 1.5 }));
    const events: EmittedEvent[] = [];
    const result = await pipeStructuredOutput({
      raw: { summary: "ok" }, // missing confidence
      schema: ResponseSchema,
      repair,
      ctx: makeCtx(events),
    });
    expect(result.ok).toBe(false);
    expect(result.repairAttempts).toBe(1);
    if (result.ok === false) {
      expect(result.validationError).toBeDefined();
    }
    expect(repair).toHaveBeenCalledTimes(1);

    const rejections = events.filter((e) => e.type === "output_schema_rejected");
    expect(rejections).toHaveLength(1);
    const payload = rejections[0]?.payload as {
      reason: string;
      validationError?: string;
      role?: string;
    };
    expect(payload.role).toBe("critic");
    expect(payload.validationError).toBeDefined();
  });
});

describe("pipeStructuredOutput — schema strictness", () => {
  test("extra-field response on a .strict() schema triggers repair", async () => {
    const repair = vi.fn(async () => ({ summary: "fixed", confidence: 0.5 }));
    const events: EmittedEvent[] = [];
    const result = await pipeStructuredOutput({
      raw: { summary: "ok", confidence: 0.8, extra: "not-allowed" },
      schema: ResponseSchema,
      repair,
      ctx: makeCtx(events),
    });
    expect(result.ok).toBe(true);
    expect(result.repairAttempts).toBe(1);
    expect(repair).toHaveBeenCalledTimes(1);
  });
});

describe("pipeStructuredOutput — repair throws", () => {
  test("repair throws → the error propagates (treated as an adapter failure)", async () => {
    const repair = vi.fn(async () => {
      throw new Error("adapter failed during repair");
    });
    const events: EmittedEvent[] = [];
    await expect(
      pipeStructuredOutput({
        raw: { summary: "ok" }, // invalid first
        schema: ResponseSchema,
        repair,
        ctx: makeCtx(events),
      }),
    ).rejects.toThrow(/adapter failed during repair/);
    expect(events.filter((e) => e.type === "output_schema_rejected")).toHaveLength(0);
  });
});

describe("pipeStructuredOutput — never retries beyond 1", () => {
  test("repair is called exactly once even if its result also fails", async () => {
    const repair = vi.fn(async () => ({ wrong: "shape" }));
    const events: EmittedEvent[] = [];
    await pipeStructuredOutput({
      raw: { wrong: "shape" },
      schema: ResponseSchema,
      repair,
      ctx: makeCtx(events),
    });
    expect(repair).toHaveBeenCalledTimes(1);
  });
});
