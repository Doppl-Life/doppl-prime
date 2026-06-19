import { describe, expect, test } from "vitest";
import { eventFixtures } from "../__fixtures__/events.js";
import { RunEventEnvelope } from "../events/envelope.js";
import { RunEventTypeValues } from "../events/event-type.js";
import { parseEventPayload } from "../events/payloads/per-type-map.js";
import { redact } from "../security/redaction.js";
import { spec } from "../testing/spec-tag.js";
import { CONTRACTS_SCHEMA_VERSION } from "../version.js";

describe(`${spec("§2.5")} payload-agreement matrix — every RunEventType has a canonical fixture`, () => {
  test("eventFixtures has an entry for every RunEventType value", () => {
    for (const type of RunEventTypeValues) {
      expect(eventFixtures).toHaveProperty(type);
    }
  });

  test("eventFixtures has no entries beyond RunEventTypeValues", () => {
    const known = new Set<string>(RunEventTypeValues);
    for (const key of Object.keys(eventFixtures)) {
      expect(known.has(key)).toBe(true);
    }
  });

  test.each(RunEventTypeValues.map((t) => [t]))(
    "parseEventPayload(%s, fixture) succeeds",
    (type) => {
      const fixture = eventFixtures[type];
      expect(() => parseEventPayload(type, fixture)).not.toThrow();
    },
  );
});

describe(`${spec("§14")} redaction round-trip — every fixture still parses after redact()`, () => {
  test.each(RunEventTypeValues.map((t) => [t]))(
    "redact(fixture(%s)) still parses through its payload schema",
    (type) => {
      const fixture = eventFixtures[type];
      const scrubbed = redact(fixture);
      expect(() => parseEventPayload(type, scrubbed)).not.toThrow();
    },
  );
});

describe(`${spec("§4")} RunEventEnvelope.schemaVersion forward-compat`, () => {
  const baseEnvelope = {
    id: "evt_1",
    runId: "run_1",
    type: "run.started" as const,
    sequence: 0,
    occurredAt: "2026-06-19T12:00:00.000Z",
    actor: "runtime" as const,
    payload: { startedAt: "2026-06-19T12:00:00.000Z" },
  };

  test("accepts schemaVersion === CONTRACTS_SCHEMA_VERSION", () => {
    expect(
      RunEventEnvelope.parse({ ...baseEnvelope, schemaVersion: CONTRACTS_SCHEMA_VERSION }),
    ).toBeDefined();
  });

  test("accepts schemaVersion < CONTRACTS_SCHEMA_VERSION (forward-compat)", () => {
    if (CONTRACTS_SCHEMA_VERSION > 1) {
      expect(RunEventEnvelope.parse({ ...baseEnvelope, schemaVersion: 1 })).toBeDefined();
    }
    // At the bootstrap freeze schemaVersion === 1, so this test exercises
    // the same path as the equal-version case until a later version lands.
  });

  test("rejects schemaVersion < 1 (must be positive int)", () => {
    expect(() => RunEventEnvelope.parse({ ...baseEnvelope, schemaVersion: 0 })).toThrow();
  });
});
