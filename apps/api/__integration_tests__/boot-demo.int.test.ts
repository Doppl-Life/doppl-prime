import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTRACTS_SCHEMA_VERSION } from "@doppl/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { BootEnvError, bootDemo } from "../scripts/boot-demo.js";
import type { ReplayArtifact } from "../src/event-store/scripts/dump-replay.js";
import { SchemaVersionMismatchError } from "../src/event-store/scripts/seed-demo.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

describe("spec(§15, PD.3) bootDemo", () => {
  let handle: PgContainerHandle;
  let tmpDir: string;

  beforeAll(async () => {
    handle = await startPgContainer({ migrate: false });
    tmpDir = await mkdtemp(join(tmpdir(), "doppl-boot-demo-"));
  });
  afterAll(async () => {
    await handle?.cleanup();
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });
  beforeEach(async () => {
    // Reset between tests — each starts from a clean DB.
    await handle.pool.query("DROP SCHEMA public CASCADE");
    await handle.pool.query("CREATE SCHEMA public");
    await handle.pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  });

  async function runBoot(extraEnv: NodeJS.ProcessEnv = {}) {
    return bootDemo({
      env: {
        DATABASE_URL: handle.connectionString,
        DOPPL_DEMO_HTTP_PORT: "0",
        ...extraEnv,
      },
      pool: handle.pool,
    });
  }

  test("happy path: env valid → boot completes", async () => {
    const result = await runBoot();
    try {
      expect(result.fixtureLoaded).toBeNull();
      expect(result.langfuseMode).toBe("local-trace");
      expect(result.port).toBeGreaterThanOrEqual(0);
    } finally {
      await result.shutdown();
    }
  });

  test("missing DATABASE_URL → BootEnvError with named issue", async () => {
    await expect(
      bootDemo({
        env: { DOPPL_DEMO_HTTP_PORT: "0" },
        pool: handle.pool,
      }),
    ).rejects.toThrow(BootEnvError);
  });

  test("DOPPL_DEMO_FIXTURE seeds the fixture", async () => {
    const runId = "00000000-0000-0000-0000-000000000007";
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
    const fixturePath = join(tmpDir, "happy.json");
    await writeFile(fixturePath, JSON.stringify(artifact));

    const result = await runBoot({ DOPPL_DEMO_FIXTURE: fixturePath });
    try {
      expect(result.fixtureLoaded?.runId).toBe(runId);
      expect(result.fixtureLoaded?.eventsLoaded).toBe(1);
    } finally {
      await result.shutdown();
    }
  });

  test("forward-schema fixture → SchemaVersionMismatchError surfaced", async () => {
    const runId = "00000000-0000-0000-0000-000000000008";
    const artifact: ReplayArtifact = {
      runId,
      schemaVersion: CONTRACTS_SCHEMA_VERSION + 99,
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
          schemaVersion: CONTRACTS_SCHEMA_VERSION + 99,
        },
      ],
    };
    const fixturePath = join(tmpDir, "forward.json");
    await writeFile(fixturePath, JSON.stringify(artifact));

    await expect(runBoot({ DOPPL_DEMO_FIXTURE: fixturePath })).rejects.toThrow(
      SchemaVersionMismatchError,
    );
  });

  test("Langfuse keys present → mode='cloud'", async () => {
    const result = await runBoot({
      LANGFUSE_PUBLIC_KEY: "pk-xxx",
      LANGFUSE_SECRET_KEY: "sk-xxx",
    });
    try {
      expect(result.langfuseMode).toBe("cloud");
    } finally {
      await result.shutdown();
    }
  });
});
