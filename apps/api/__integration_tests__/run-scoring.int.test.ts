import type { ModelGatewayRequest, ModelGatewayResponse } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { ModelGateway } from "../src/model-gateway/gateway.js";
import { makeScoreHook } from "../src/selection/run-scoring.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const EMBED_DIM = 3;

function makeEmbeddingGateway(): ModelGateway {
  let nthCall = 0;
  return {
    invoke: async (req: ModelGatewayRequest): Promise<ModelGatewayResponse> => {
      if (req.role !== "embedding") {
        throw new Error("only embedding role supported in this fake");
      }
      // Deterministic vector keyed on the call index so different
      // candidates produce distinguishable embeddings.
      nthCall += 1;
      const vec = Array.from({ length: EMBED_DIM }, (_, i) => Math.sin(nthCall + i));
      return {
        ok: true,
        output: {
          vector: vec,
          embeddingModelId: "text-embedding-3-large",
          dimension: EMBED_DIM,
        },
        repairAttempts: 0,
        energyEstimate: 1,
      };
    },
  };
}

describe("spec(§8) makeScoreHook end-to-end", () => {
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

  test("3 candidates → 3 novelty.scored + 3 fitness.scored events", async () => {
    const hook = makeScoreHook({
      db,
      gateway: makeEmbeddingGateway(),
      runId: "run_sh1",
      getCurrentGenerationIndex: () => 0,
    });
    await hook([
      { candidateId: "cand_a", agenomeId: "ag_a", rawOutput: { summary: "alpha" } },
      { candidateId: "cand_b", agenomeId: "ag_b", rawOutput: { summary: "beta" } },
      { candidateId: "cand_c", agenomeId: "ag_c", rawOutput: { summary: "gamma" } },
    ]);

    const nov = await handle.pool.query(
      "SELECT COUNT(*) FROM run_events WHERE run_id = $1 AND type = 'novelty.scored'",
      ["run_sh1"],
    );
    expect(Number(nov.rows[0].count)).toBe(3);

    const fit = await handle.pool.query(
      "SELECT COUNT(*) FROM run_events WHERE run_id = $1 AND type = 'fitness.scored'",
      ["run_sh1"],
    );
    expect(Number(fit.rows[0].count)).toBe(3);
  });

  test("empty candidates → no events", async () => {
    const hook = makeScoreHook({
      db,
      gateway: makeEmbeddingGateway(),
      runId: "run_sh2",
      getCurrentGenerationIndex: () => 0,
    });
    await hook([]);
    const rows = await handle.pool.query("SELECT COUNT(*) FROM run_events WHERE run_id = $1", [
      "run_sh2",
    ]);
    expect(Number(rows.rows[0].count)).toBe(0);
  });

  test("embed failure → degrade path emits novelty_scoring_degraded + continues", async () => {
    const failingGateway: ModelGateway = {
      invoke: async () => {
        throw new Error("provider down");
      },
    };
    const hook = makeScoreHook({
      db,
      gateway: failingGateway,
      runId: "run_sh3",
      getCurrentGenerationIndex: () => 0,
    });
    await hook([{ candidateId: "cand_a", agenomeId: "ag_a", rawOutput: { summary: "alpha" } }]);
    const types = await handle.pool.query<{ type: string }>(
      "SELECT type FROM run_events WHERE run_id = $1 ORDER BY sequence",
      ["run_sh3"],
    );
    const typeList = types.rows.map((r) => r.type);
    expect(typeList).toContain("novelty_scoring_degraded");
    expect(typeList).toContain("novelty.scored");
    expect(typeList).toContain("fitness.scored");
  });
});
