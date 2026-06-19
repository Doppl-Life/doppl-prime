import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelGatewayRequest } from "@doppl/contracts";
import { describe, expect, test } from "vitest";
import { RecordedFixtureNotFoundError } from "../errors.js";
import { RecordedGateway } from "../recorded-gateway.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(here, "..", "..", "..", "__fixtures__", "recorded-responses");

function makeReq(overrides: Partial<ModelGatewayRequest> = {}): ModelGatewayRequest {
  return {
    role: "critic",
    runId: "run_test",
    input: { prompt: "review this candidate" },
    correlationId: "corr_test",
    ...overrides,
  };
}

describe("RecordedGateway — fixture lookup by role", () => {
  test("loads the default fixture for a role and returns it as ModelGatewayResponse", async () => {
    const gateway = new RecordedGateway({
      fixtureDir: FIXTURE_DIR,
      adapter: "openrouter",
    });
    const res = await gateway.invoke(makeReq());
    expect(res.ok).toBe(true);
    expect(res.providerTraceId).toBe("completion_recorded_critic");
    expect(res.energyActual).toBe(3);
  });

  test("different role resolves to a different fixture", async () => {
    const gateway = new RecordedGateway({
      fixtureDir: FIXTURE_DIR,
      adapter: "openrouter",
    });
    const res = await gateway.invoke(makeReq({ role: "population_generator" }));
    expect(res.providerTraceId).toBe("completion_recorded_popgen");
  });

  test("embedding role resolves under the openai-embedding adapter dir", async () => {
    const gateway = new RecordedGateway({
      fixtureDir: FIXTURE_DIR,
      adapter: "openai-embedding",
    });
    const res = await gateway.invoke(makeReq({ role: "embedding", input: { text: "hello" } }));
    expect(res.ok).toBe(true);
    expect(res.providerTraceId).toBe("embedding_recorded");
    const out = res.output as { embeddingModelId: string; dimension: number };
    expect(out.embeddingModelId).toBe("text-embedding-3-small");
  });
});

describe("RecordedGateway — missing fixture", () => {
  test("throws RecordedFixtureNotFoundError with the resolved path", async () => {
    const gateway = new RecordedGateway({
      fixtureDir: FIXTURE_DIR,
      adapter: "openrouter",
    });
    let caught: unknown;
    try {
      await gateway.invoke(makeReq({ role: "final_judge" }));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RecordedFixtureNotFoundError);
    const err = caught as RecordedFixtureNotFoundError;
    expect(err.fixturePath).toMatch(/openrouter\/final_judge/);
  });
});

describe("RecordedGateway — invalid fixture JSON", () => {
  test("a malformed fixture file produces a clear error path", async () => {
    const gateway = new RecordedGateway({
      fixtureDir: path.resolve(FIXTURE_DIR, "..", "this-dir-does-not-exist"),
      adapter: "openrouter",
    });
    await expect(gateway.invoke(makeReq())).rejects.toBeInstanceOf(RecordedFixtureNotFoundError);
  });
});
