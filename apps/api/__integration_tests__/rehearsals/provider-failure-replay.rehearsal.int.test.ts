import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { replayReader } from "../../src/event-store/replay-reader.js";
import { activateReplay } from "../../src/runtime/demo/fallback-ladder.js";
import { type RehearsalEnv, buildRecordedRun, resetDb, startRehearsalEnv } from "./helpers.js";

/**
 * §16 demo path #2 — "Provider failure → labeled replay": the live
 * provider returns an error mid-demo and the operator switches to the
 * labeled-replay rung. This rehearsal proves that the replay rung
 * activation produces the same projection a previously-recorded run
 * yielded — the audience sees an identical trajectory regardless of
 * which rung is active.
 *
 * The provider failure itself isn't simulated here (it would belong
 * in a live-mode test guarded by DOPPL_LIVE_TESTS). The rehearsal
 * narrates the fallback by asserting that activateReplay yields a
 * mode='replay' run whose events match the original.
 */

describe("rehearsal §16: provider-failure → fallback to replay rung", () => {
  let env: RehearsalEnv;

  beforeAll(async () => {
    env = await startRehearsalEnv();
  });
  afterAll(async () => {
    await env?.cleanup();
  });

  test("activateReplay reproduces the recorded projection on the new run row", async () => {
    const { fixturePath, runId: originalRunId } = await buildRecordedRun(env);

    const originalEvents: { type: string; sequence: number }[] = [];
    for await (const e of replayReader(env.db).events(originalRunId)) {
      originalEvents.push({ type: e.type, sequence: e.sequence });
    }
    expect(originalEvents.length).toBe(5);

    await resetDb(env);

    const result = await activateReplay({ db: env.db, fixturePath });
    expect(result.mode).toBe("replay");
    expect(result.runId).toBe(originalRunId);

    const restored: { type: string; sequence: number }[] = [];
    for await (const e of replayReader(env.db).events(result.runId)) {
      restored.push({ type: e.type, sequence: e.sequence });
    }
    expect(restored).toEqual(originalEvents);
  });
});
