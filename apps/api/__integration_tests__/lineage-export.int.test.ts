import { LineageGraphProjection } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { exportLineageAsJson } from "../src/projections/lineage-export.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

describe("spec(§9) exportLineageAsJson", () => {
  let handle: PgContainerHandle;
  let db: NodePgDatabase;

  beforeAll(async () => {
    handle = await startPgContainer();
    db = drizzle(handle.pool);
  });
  afterAll(async () => {
    await handle?.cleanup();
  });
  beforeEach(async () => {
    await handle.pool.query("TRUNCATE run_events");
  });

  test("output round-trips through LineageGraphProjection.parse", async () => {
    const runId = "run_export";
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: {
        candidate: {
          id: "cand_x",
          runId,
          generationId: "gen_0",
          agenomeId: "ag_x",
          subtype: "cross_domain_transfer",
          title: "t",
          summary: "s",
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
      candidateId: "cand_x",
      agenomeId: "ag_x",
    });

    const json = await exportLineageAsJson({ db, runId });
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json);
    expect(() => LineageGraphProjection.parse(parsed)).not.toThrow();
    expect(parsed.runId).toBe(runId);
  });

  test("empty run produces a parseable empty graph", async () => {
    const json = await exportLineageAsJson({ db, runId: "run_empty_export" });
    const parsed = JSON.parse(json);
    expect(() => LineageGraphProjection.parse(parsed)).not.toThrow();
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
  });
});
