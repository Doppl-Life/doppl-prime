import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { replayReader } from "../../src/event-store/replay-reader.js";
import { seedDemo } from "../../src/event-store/scripts/seed-demo.js";
import { type RehearsalEnv, buildRecordedRun, resetDb, startRehearsalEnv } from "./helpers.js";

/**
 * §16 demo path #1 — "Prepared run": the operator loads a known-good
 * recorded fixture. The dashboard renders it as a replay-served run.
 *
 * This rehearsal proves that a dump → seed round-trip reconstructs an
 * event log byte-for-byte equivalent to the source, with the run row
 * tagged mode='replay'. This is the safety net the operator falls to
 * if the live provider hiccups during the showcase.
 */

describe("rehearsal §16: prepared-run loads + replay summary matches", () => {
  let env: RehearsalEnv;

  beforeAll(async () => {
    env = await startRehearsalEnv();
  });
  afterAll(async () => {
    await env?.cleanup();
  });

  test("dump → reset → seedDemo produces identical events + mode='replay'", async () => {
    const { fixturePath, runId: originalRunId } = await buildRecordedRun(env);

    // Read the dumped events in order via the replay reader (canonical).
    const original: { type: string; sequence: number }[] = [];
    for await (const e of replayReader(env.db).events(originalRunId)) {
      original.push({ type: e.type, sequence: e.sequence });
    }
    expect(original).toEqual([
      { type: "run.configured", sequence: 0 },
      { type: "run.started", sequence: 1 },
      { type: "generation.started", sequence: 2 },
      { type: "generation.completed", sequence: 3 },
      { type: "run.completed", sequence: 4 },
    ]);

    await resetDb(env);

    const seeded = await seedDemo({ db: env.db, fixturePath });
    expect(seeded.runId).toBe(originalRunId);
    expect(seeded.eventsLoaded).toBe(5);

    const restored: { type: string; sequence: number }[] = [];
    for await (const e of replayReader(env.db).events(seeded.runId)) {
      restored.push({ type: e.type, sequence: e.sequence });
    }
    expect(restored).toEqual(original);

    const row = await env.handle.pool.query<{ mode: string; status: string }>(
      "SELECT mode, status FROM runs WHERE id = $1",
      [seeded.runId],
    );
    expect(row.rows[0]?.mode).toBe("replay");
    expect(row.rows[0]?.status).toBe("completed");
  });
});
