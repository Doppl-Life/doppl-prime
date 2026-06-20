import { describe, expect, test } from "vitest";
import { type LogRecord, createKernelLogger } from "../kernel-logger.js";

describe("kernel-logger", () => {
  test("emits a JSON record with ts + level + msg", () => {
    const captured: LogRecord[] = [];
    const log = createKernelLogger({
      sink: (r) => captured.push(r),
      now: () => 1735689600000,
    });
    log.info("hello");
    expect(captured).toHaveLength(1);
    expect(captured[0]?.msg).toBe("hello");
    expect(captured[0]?.level).toBe("info");
    expect(captured[0]?.ts).toBe(new Date(1735689600000).toISOString());
  });

  test("withContext propagates ids into subsequent records", () => {
    const captured: LogRecord[] = [];
    const log = createKernelLogger({ sink: (r) => captured.push(r) });
    const scoped = log.withContext({ runId: "run-1", generationId: "gen-0" });
    scoped.info("from scoped");
    expect(captured[0]?.runId).toBe("run-1");
    expect(captured[0]?.generationId).toBe("gen-0");
  });

  test("extras merge into the record", () => {
    const captured: LogRecord[] = [];
    const log = createKernelLogger({ sink: (r) => captured.push(r) });
    log.warn("careful", { lastSequence: 42, runId: "run-x" });
    expect(captured[0]?.level).toBe("warn");
    expect(captured[0]?.lastSequence).toBe(42);
    expect(captured[0]?.runId).toBe("run-x");
  });

  test("redact() scrubs secret-shaped values before write", () => {
    const captured: LogRecord[] = [];
    const log = createKernelLogger({ sink: (r) => captured.push(r) });
    log.error("auth failed", { authorization: "Bearer sk-xxx-secret-key" });
    const value = captured[0]?.authorization;
    expect(String(value)).not.toContain("sk-xxx-secret-key");
  });

  test("level helpers each emit with the right level", () => {
    const captured: LogRecord[] = [];
    const log = createKernelLogger({ sink: (r) => captured.push(r) });
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(captured.map((r) => r.level)).toEqual(["info", "warn", "error"]);
  });

  test("nested withContext composes contexts deterministically", () => {
    const captured: LogRecord[] = [];
    const log = createKernelLogger({ sink: (r) => captured.push(r) });
    const a = log.withContext({ runId: "r1" });
    const b = a.withContext({ generationId: "g1" });
    b.info("hi");
    expect(captured[0]?.runId).toBe("r1");
    expect(captured[0]?.generationId).toBe("g1");
  });
});
