import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { canonicalize } from "../src/event-store/canonical-serialization.js";
import { replayReader } from "../src/event-store/replay-reader.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";
import { type RunEndProjection, buildSampleRun, foldIntoProjection } from "./helpers/seed.js";

async function replayIntoProjection(db: NodePgDatabase, runId: string): Promise<RunEndProjection> {
  const projection: RunEndProjection = {
    runId,
    totalEvents: 0,
    finalSequence: -1,
    byType: {},
    byActor: {},
    eventTypes: [],
  };
  for await (const env of replayReader(db).events(runId)) {
    foldIntoProjection(projection, env);
  }
  return projection;
}

describe("spec(§4) replay state-equivalence: rebuilt == captured (canonical JSON)", () => {
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

  test("11-event sample run: rebuilt projection canonicalizes equal to captured", async () => {
    const captured = await buildSampleRun(db, "run_equiv");
    const rebuilt = await replayIntoProjection(db, "run_equiv");
    expect(canonicalize(rebuilt)).toBe(canonicalize(captured));
  });

  test("equivalence holds when a provider_call_failed event is present", async () => {
    const captured = await buildSampleRun(db, "run_with_failure", {
      includeFailureEvent: true,
    });
    const rebuilt = await replayIntoProjection(db, "run_with_failure");
    expect(canonicalize(rebuilt)).toBe(canonicalize(captured));
    expect(captured.byType.provider_call_failed).toBe(1);
    expect(rebuilt.byType.provider_call_failed).toBe(1);
  });

  test("equivalence holds when a payload contained a secret (redaction is deterministic)", async () => {
    const captured = await buildSampleRun(db, "run_with_secret", {
      includeSecretInPayload: true,
    });
    const rebuilt = await replayIntoProjection(db, "run_with_secret");
    expect(canonicalize(rebuilt)).toBe(canonicalize(captured));
  });
});
