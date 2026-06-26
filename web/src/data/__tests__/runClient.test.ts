import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ClientHttpError, ClientValidationError, createRunClient } from "../runClient.js";

function makeFetchMock(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(handler(url, init));
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createRunClient — list / read endpoints", () => {
  test("listRuns parses the RunListResponse", async () => {
    const fetchImpl = makeFetchMock((url) => {
      expect(url).toBe("http://x/runs");
      return jsonResponse(200, {
        runs: [{ id: "r1", status: "configured", configuredAt: "2026-06-19T00:00:00Z" }],
      });
    });
    const client = createRunClient({ baseUrl: "http://x", fetchImpl });
    const list = await client.listRuns();
    expect(list.runs).toHaveLength(1);
    expect(list.runs[0]?.id).toBe("r1");
  });

  test("malformed list payload → ClientValidationError with path/issues", async () => {
    const fetchImpl = makeFetchMock(() => jsonResponse(200, { runs: [{ id: "" }] }));
    const client = createRunClient({ baseUrl: "http://x", fetchImpl });
    await expect(client.listRuns()).rejects.toThrow(ClientValidationError);
  });

  test("non-2xx response throws ClientHttpError", async () => {
    const fetchImpl = makeFetchMock(() => jsonResponse(500, { error: "boom" }));
    const client = createRunClient({ baseUrl: "http://x", fetchImpl });
    await expect(client.listRuns()).rejects.toThrow(ClientHttpError);
  });

  test("getEvents constructs ?afterSequence=&limit= query string", async () => {
    let captured = "";
    const fetchImpl = makeFetchMock((url) => {
      captured = url;
      return jsonResponse(200, { runId: "r1", events: [], count: 0 });
    });
    const client = createRunClient({ baseUrl: "http://x", fetchImpl });
    await client.getEvents("r1", { afterSequence: 5, limit: 10 });
    expect(captured).toContain("afterSequence=5");
    expect(captured).toContain("limit=10");
  });

  test("getLineage validates against LineageGraphProjection", async () => {
    const fetchImpl = makeFetchMock(() =>
      jsonResponse(200, { runId: "r1", sequenceThrough: 0, nodes: [], edges: [] }),
    );
    const client = createRunClient({ baseUrl: "http://x", fetchImpl });
    const out = await client.getLineage("r1");
    expect(out.runId).toBe("r1");
    expect(out.nodes).toEqual([]);
  });

  test("getHealth parses the typed health shape", async () => {
    const fetchImpl = makeFetchMock(() =>
      jsonResponse(200, {
        runId: "r1",
        status: "configured",
        currentGeneration: 0,
        candidatesInFlight: 0,
        lastEventAt: null,
        capsConsumed: { energy: 0, generations: 0, candidates: 0, toolCalls: 0 },
        lastHeartbeatMs: null,
      }),
    );
    const client = createRunClient({ baseUrl: "http://x", fetchImpl });
    const health = await client.getHealth("r1");
    expect(health.status).toBe("configured");
  });
});

describe("createRunClient — mutating commands", () => {
  test("startRun forwards Idempotency-Key when supplied", async () => {
    let captured: RequestInit | undefined;
    const fetchImpl = makeFetchMock((_url, init) => {
      captured = init;
      return jsonResponse(201, { runId: "r-new" });
    });
    const client = createRunClient({ baseUrl: "http://x", fetchImpl });
    const out = await client.startRun({ seed: "x" }, { idempotencyKey: "key-1" });
    expect(out.runId).toBe("r-new");
    const headers = captured?.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("key-1");
  });

  test("startRun omits Idempotency-Key when not supplied", async () => {
    let captured: RequestInit | undefined;
    const fetchImpl = makeFetchMock((_url, init) => {
      captured = init;
      return jsonResponse(201, { runId: "r-new" });
    });
    const client = createRunClient({ baseUrl: "http://x", fetchImpl });
    await client.startRun({ seed: "x" });
    const headers = captured?.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  test("stopRun POSTs to /runs/:id/stop", async () => {
    let captured = "";
    const fetchImpl = makeFetchMock((url, init) => {
      captured = `${init?.method ?? "GET"} ${url}`;
      return jsonResponse(200, { runId: "r1", alreadyTerminal: false });
    });
    const client = createRunClient({ baseUrl: "http://x", fetchImpl });
    await client.stopRun("r1");
    expect(captured).toBe("POST http://x/runs/r1/stop");
  });
});
