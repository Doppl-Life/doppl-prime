import { describe, expect, test } from "vitest";
import {
  CheckRegistryError,
  type CheckRunnerFn,
  buildCheckRegistry,
  defineCheckAdapter,
} from "../registry.js";

const noopFn: CheckRunnerFn = async () => ({
  checkType: "test.noop",
  status: "passed",
  evidenceRefs: [],
});

describe("defineCheckAdapter", () => {
  test("returns a frozen registered adapter with id + checkType + description", () => {
    const reg = defineCheckAdapter({
      id: "test.alpha",
      checkType: "test.alpha",
      description: "test alpha adapter",
      capabilities: ["evidence"],
      fn: noopFn,
    });
    expect(reg.adapter.id).toBe("test.alpha");
    expect(reg.adapter.checkType).toBe("test.alpha");
    expect(reg.adapter.description).toBe("test alpha adapter");
    expect(reg.adapter.capabilities).toEqual(["evidence"]);
  });

  test("rejects an adapter missing id", () => {
    expect(() =>
      defineCheckAdapter({
        id: "",
        checkType: "x",
        description: "y",
        fn: noopFn,
      }),
    ).toThrow(CheckRegistryError);
  });

  test("rejects an adapter with a non-function fn", () => {
    expect(() =>
      defineCheckAdapter({
        id: "test.beta",
        checkType: "x",
        description: "y",
        fn: undefined as unknown as CheckRunnerFn,
      }),
    ).toThrow(CheckRegistryError);
  });

  test("rejects an adapter carrying an `execute` field via type-cast", () => {
    const malicious = {
      id: "test.gamma",
      checkType: "x",
      description: "y",
      fn: noopFn,
      execute: true,
    } as unknown as Parameters<typeof defineCheckAdapter>[0];
    expect(() => defineCheckAdapter(malicious)).toThrow(/forbidden field "execute"/);
  });

  test("rejects an adapter carrying an `eval` field via type-cast", () => {
    const malicious = {
      id: "test.delta",
      checkType: "x",
      description: "y",
      fn: noopFn,
      eval: "code",
    } as unknown as Parameters<typeof defineCheckAdapter>[0];
    expect(() => defineCheckAdapter(malicious)).toThrow(/forbidden field "eval"/);
  });

  test("capabilities defaults to empty array when omitted", () => {
    const reg = defineCheckAdapter({
      id: "test.epsilon",
      checkType: "x",
      description: "y",
      fn: noopFn,
    });
    expect(reg.adapter.capabilities).toEqual([]);
  });
});

describe("buildCheckRegistry", () => {
  test("constructs a registry exposing has / get / ids", () => {
    const reg = buildCheckRegistry([
      defineCheckAdapter({ id: "a", checkType: "a", description: "a", fn: noopFn }),
      defineCheckAdapter({ id: "b", checkType: "b", description: "b", fn: noopFn }),
    ]);
    expect(reg.has("a")).toBe(true);
    expect(reg.has("b")).toBe(true);
    expect(reg.has("c")).toBe(false);
    expect(reg.get("a")?.adapter.id).toBe("a");
    expect(reg.get("c")).toBeUndefined();
    expect(reg.ids().slice().sort()).toEqual(["a", "b"]);
  });

  test("throws on duplicate adapter ids", () => {
    expect(() =>
      buildCheckRegistry([
        defineCheckAdapter({ id: "x", checkType: "a", description: "a", fn: noopFn }),
        defineCheckAdapter({ id: "x", checkType: "b", description: "b", fn: noopFn }),
      ]),
    ).toThrow(/duplicate adapter id/);
  });

  test("does not expose set or delete on the registry surface", () => {
    const reg = buildCheckRegistry([
      defineCheckAdapter({ id: "z", checkType: "z", description: "z", fn: noopFn }),
    ]);
    expect((reg as unknown as Record<string, unknown>).set).toBeUndefined();
    expect((reg as unknown as Record<string, unknown>).delete).toBeUndefined();
    expect((reg as unknown as Record<string, unknown>).clear).toBeUndefined();
  });

  test("the registry itself is frozen at the public surface", () => {
    const reg = buildCheckRegistry([]);
    expect(Object.isFrozen(reg)).toBe(true);
  });

  test("empty adapter list produces an empty registry", () => {
    const reg = buildCheckRegistry([]);
    expect(reg.has("anything")).toBe(false);
    expect(reg.ids()).toEqual([]);
  });
});
