import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MissingDatabaseUrlError, createPool } from "../connection.js";

describe("createPool", () => {
  let originalUrl: string | undefined;

  beforeEach(() => {
    originalUrl = process.env.DATABASE_URL;
    // biome-ignore lint/performance/noDelete: canonical env-var unset for tests
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      // biome-ignore lint/performance/noDelete: canonical env-var unset for tests
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  test("creates a Pool with an explicit connectionString without connecting", async () => {
    const pool = createPool({ connectionString: "postgres://invalid:5432/x" });
    expect(pool).toBeDefined();
    await pool.end();
  });

  test("reads DATABASE_URL from process.env when no arg is supplied", async () => {
    process.env.DATABASE_URL = "postgres://doppl:doppl@localhost:5432/doppl_dev";
    const pool = createPool();
    expect(pool).toBeDefined();
    await pool.end();
  });

  test("throws MissingDatabaseUrlError when no arg and no env var", () => {
    expect(() => createPool()).toThrow(MissingDatabaseUrlError);
    expect(() => createPool()).toThrow(/DATABASE_URL/);
  });

  test("MissingDatabaseUrlError carries a clear name", () => {
    try {
      createPool();
    } catch (e) {
      expect((e as Error).name).toBe("MissingDatabaseUrlError");
    }
  });
});
