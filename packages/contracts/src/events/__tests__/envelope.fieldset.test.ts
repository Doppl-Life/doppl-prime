import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { RunEventEnvelope } from "../envelope.js";

describe(`${spec("§4")} RunEventEnvelope`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(RunEventEnvelope)).toMatchInlineSnapshot(`
      [
        "actor",
        "agenomeId",
        "candidateId",
        "correlationId",
        "generationId",
        "id",
        "langfuseObservationId",
        "langfuseTraceId",
        "occurredAt",
        "payload",
        "runId",
        "schemaVersion",
        "sequence",
        "type",
      ]
    `);
  });

  test("parses a fully-populated envelope", () => {
    const env = {
      id: "evt_1",
      runId: "run_1",
      generationId: "gen_1",
      agenomeId: "ag_1",
      candidateId: "cand_1",
      type: "run.configured",
      sequence: 0,
      occurredAt: "2026-06-19T14:00:00.000Z",
      actor: "operator",
      correlationId: "corr_1",
      langfuseTraceId: "trace_1",
      langfuseObservationId: "obs_1",
      payload: { whatever: true },
      schemaVersion: 1,
    };
    expect(RunEventEnvelope.parse(env)).toEqual(env);
  });

  test("parses a minimal envelope (only required fields)", () => {
    const env = {
      id: "evt_1",
      runId: "run_1",
      type: "run.started",
      sequence: 1,
      occurredAt: "2026-06-19T14:00:00.000Z",
      actor: "runtime",
      payload: {},
      schemaVersion: 1,
    };
    expect(RunEventEnvelope.parse(env)).toEqual(env);
  });

  test("rejects unknown envelope fields (.strict())", () => {
    const env = {
      id: "evt_1",
      runId: "run_1",
      type: "run.started",
      sequence: 1,
      occurredAt: "2026-06-19T14:00:00.000Z",
      actor: "runtime",
      payload: {},
      schemaVersion: 1,
      whoops: "extra",
    };
    expect(() => RunEventEnvelope.parse(env)).toThrow();
  });

  test("rejects negative sequence", () => {
    const env = {
      id: "evt_1",
      runId: "run_1",
      type: "run.started",
      sequence: -1,
      occurredAt: "2026-06-19T14:00:00.000Z",
      actor: "runtime",
      payload: {},
      schemaVersion: 1,
    };
    expect(() => RunEventEnvelope.parse(env)).toThrow();
  });

  test("rejects non-ISO occurredAt", () => {
    const env = {
      id: "evt_1",
      runId: "run_1",
      type: "run.started",
      sequence: 1,
      occurredAt: "2026/06/19 14:00",
      actor: "runtime",
      payload: {},
      schemaVersion: 1,
    };
    expect(() => RunEventEnvelope.parse(env)).toThrow();
  });

  test("rejects invalid actor value (closed union enforcement at envelope)", () => {
    const env = {
      id: "evt_1",
      runId: "run_1",
      type: "run.started",
      sequence: 1,
      occurredAt: "2026-06-19T14:00:00.000Z",
      actor: "developer",
      payload: {},
      schemaVersion: 1,
    };
    expect(() => RunEventEnvelope.parse(env)).toThrow();
  });

  test("rejects invalid type value (closed registry enforcement at envelope)", () => {
    const env = {
      id: "evt_1",
      runId: "run_1",
      type: "run.exploded",
      sequence: 1,
      occurredAt: "2026-06-19T14:00:00.000Z",
      actor: "runtime",
      payload: {},
      schemaVersion: 1,
    };
    expect(() => RunEventEnvelope.parse(env)).toThrow();
  });
});
