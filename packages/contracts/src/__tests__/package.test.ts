import { describe, expect, test } from "vitest";
import { CONTRACTS_SCHEMA_VERSION } from "../index.js";

describe("@doppl/contracts package", () => {
  test("CONTRACTS_SCHEMA_VERSION is exported and equals 1", () => {
    expect(CONTRACTS_SCHEMA_VERSION).toBe(1);
  });

  test("CONTRACTS_SCHEMA_VERSION is typed as the literal 1", () => {
    const v: 1 = CONTRACTS_SCHEMA_VERSION;
    expect(v).toBe(1);
  });
});
