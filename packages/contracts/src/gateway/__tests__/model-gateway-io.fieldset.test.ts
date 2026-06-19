import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { ModelGatewayRequest, ModelGatewayResponse } from "../model-gateway-io.js";

describe(`${spec("§9")} ModelGatewayRequest`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(ModelGatewayRequest)).toMatchInlineSnapshot(`
      [
        "agenomeId",
        "candidateId",
        "correlationId",
        "generationId",
        "input",
        "role",
        "runId",
        "schemaForOutput",
        "timeoutMs",
      ]
    `);
  });

  test("parses a minimal request", () => {
    const req = {
      role: "critic",
      runId: "run_1",
      input: { prompt: "review this" },
      correlationId: "corr_1",
    };
    expect(ModelGatewayRequest.parse(req)).toEqual(req);
  });

  test("rejects timeoutMs <= 0", () => {
    expect(() =>
      ModelGatewayRequest.parse({
        role: "critic",
        runId: "r",
        input: {},
        correlationId: "c",
        timeoutMs: 0,
      }),
    ).toThrow();
  });
});

describe(`${spec("§9")} ModelGatewayResponse`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(ModelGatewayResponse)).toMatchInlineSnapshot(`
      [
        "energyActual",
        "energyEstimate",
        "langfuseObservationId",
        "ok",
        "output",
        "providerTraceId",
        "repairAttempts",
        "validationError",
      ]
    `);
  });

  test("parses a successful response with output and reconciled actual", () => {
    const res = {
      ok: true,
      output: { content: "..." },
      repairAttempts: 0,
      providerTraceId: "trace_1",
      langfuseObservationId: "obs_1",
      energyEstimate: 100,
      energyActual: 98,
    };
    expect(ModelGatewayResponse.parse(res)).toEqual(res);
  });

  test("parses a rejected response with validationError (ok:false path)", () => {
    const res = {
      ok: false,
      repairAttempts: 1,
      validationError: "schema mismatch on field 'claims'",
      energyEstimate: 50,
    };
    expect(ModelGatewayResponse.parse(res)).toEqual(res);
  });

  test("requires energyEstimate (pre-call estimate is mandatory)", () => {
    expect(() => ModelGatewayResponse.parse({ ok: true, repairAttempts: 0 })).toThrow();
  });

  test("rejects negative repairAttempts", () => {
    expect(() =>
      ModelGatewayResponse.parse({
        ok: true,
        repairAttempts: -1,
        energyEstimate: 1,
      }),
    ).toThrow();
  });
});
