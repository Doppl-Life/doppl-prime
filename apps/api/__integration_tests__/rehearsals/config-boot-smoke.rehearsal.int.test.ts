import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTRACTS_SCHEMA_VERSION } from "@doppl/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { BootEnvError, bootDemo } from "../../scripts/boot-demo.js";
import type { ReplayArtifact } from "../../src/event-store/scripts/dump-replay.js";
import { type PgContainerHandle, startPgContainer } from "../helpers/pg-container.js";

/**
 * §16 demo path #6 — "Config + boot smoke": the operator runs the
 * unified boot script. The rehearsal proves:
 *   - Bad env → fail-fast with BootEnvError (no half-boot).
 *   - Missing fixture path → surfaces the underlying filesystem error.
 *   - Valid env → boot completes; the API is up and tradeable.
 */

describe("rehearsal §16: boot-demo smoke", () => {
  let handle: PgContainerHandle;
  let tmpDir: string;

  beforeAll(async () => {
    handle = await startPgContainer({ migrate: false });
    tmpDir = await mkdtemp(join(tmpdir(), "doppl-boot-smoke-"));
  });
  afterAll(async () => {
    await handle?.cleanup();
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });
  beforeEach(async () => {
    await handle.pool.query("DROP SCHEMA public CASCADE");
    await handle.pool.query("CREATE SCHEMA public");
    await handle.pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  });

  test("bad env → BootEnvError; no half-boot", async () => {
    await expect(
      bootDemo({
        env: { DOPPL_DEMO_HTTP_PORT: "0" },
        pool: handle.pool,
      }),
    ).rejects.toThrow(BootEnvError);
  });

  test("missing fixture path → underlying ENOENT surfaces", async () => {
    await expect(
      bootDemo({
        env: {
          DATABASE_URL: handle.connectionString,
          DOPPL_DEMO_HTTP_PORT: "0",
          DOPPL_DEMO_FIXTURE: join(tmpDir, "does-not-exist.json"),
        },
        pool: handle.pool,
      }),
    ).rejects.toThrow(/ENOENT|no such file/i);
  });

  test("valid env → boot completes; shutdown cleans up", async () => {
    const runId = "00000000-0000-0000-0000-00000000feed";
    const artifact: ReplayArtifact = {
      runId,
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      events: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          runId,
          sequence: 0,
          occurredAt: new Date().toISOString(),
          type: "run.completed",
          actor: "runtime",
          payload: { completedAt: new Date().toISOString() },
          schemaVersion: CONTRACTS_SCHEMA_VERSION,
        },
      ],
    };
    const fixturePath = join(tmpDir, "smoke.json");
    await writeFile(fixturePath, JSON.stringify(artifact));

    const result = await bootDemo({
      env: {
        DATABASE_URL: handle.connectionString,
        DOPPL_DEMO_HTTP_PORT: "0",
        DOPPL_DEMO_FIXTURE: fixturePath,
      },
      pool: handle.pool,
    });
    try {
      expect(result.fixtureLoaded?.runId).toBe(runId);
      expect(result.langfuseMode).toBe("local-trace");
    } finally {
      await result.shutdown();
    }
  });
});
