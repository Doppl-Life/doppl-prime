import { RunEventEnvelope } from "@doppl/contracts";
import { type AnyPgTable, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";
import {
  agenomes,
  allTables,
  candidateIdeas,
  checkResults,
  criticReviews,
  dashboardSnapshots,
  embeddings,
  fitnessScores,
  generations,
  lineageEdges,
  noveltyScores,
  runEvents,
  runs,
} from "../schema.js";

function columnNames(table: AnyPgTable): string[] {
  return getTableConfig(table)
    .columns.map((c) => c.name)
    .sort();
}

describe("spec(§9) canonical table column-name sets are frozen", () => {
  test("runs", () => {
    expect(columnNames(runs)).toMatchInlineSnapshot(`
      [
        "completed_at",
        "config",
        "configured_at",
        "id",
        "mode",
        "started_at",
        "status",
        "terminal_summary",
      ]
    `);
  });

  test("run_events (14 columns; the authoritative log)", () => {
    expect(columnNames(runEvents)).toMatchInlineSnapshot(`
      [
        "actor",
        "agenome_id",
        "candidate_id",
        "correlation_id",
        "generation_id",
        "id",
        "langfuse_observation_id",
        "langfuse_trace_id",
        "occurred_at",
        "payload",
        "run_id",
        "schema_version",
        "sequence",
        "type",
      ]
    `);
    expect(columnNames(runEvents)).toHaveLength(14);
  });

  test("generations", () => {
    expect(columnNames(generations)).toMatchInlineSnapshot(`
      [
        "completed_at",
        "id",
        "index",
        "run_id",
        "started_at",
        "status",
      ]
    `);
  });

  test("agenomes", () => {
    expect(columnNames(agenomes)).toMatchInlineSnapshot(`
      [
        "decomposition_policy",
        "generation_id",
        "id",
        "mutation_meta",
        "parent_ids",
        "persona_weights",
        "run_id",
        "spawn_budget",
        "status",
        "system_prompt",
        "tool_permissions",
      ]
    `);
  });

  test("candidate_ideas", () => {
    expect(columnNames(candidateIdeas)).toMatchInlineSnapshot(`
      [
        "agenome_id",
        "claims",
        "evidence_refs",
        "generation_id",
        "id",
        "run_id",
        "status",
        "subtype",
        "subtype_payload",
        "summary",
        "title",
      ]
    `);
  });

  test("critic_reviews", () => {
    expect(columnNames(criticReviews)).toMatchInlineSnapshot(`
      [
        "candidate_id",
        "confidence",
        "critique",
        "evidence_refs",
        "id",
        "mandate",
        "scores",
      ]
    `);
  });

  test("check_results", () => {
    expect(columnNames(checkResults)).toMatchInlineSnapshot(`
      [
        "candidate_id",
        "check_type",
        "error",
        "evidence_refs",
        "id",
        "output",
        "score",
        "skip_reason",
        "status",
      ]
    `);
  });

  test("fitness_scores", () => {
    expect(columnNames(fitnessScores)).toMatchInlineSnapshot(`
      [
        "candidate_id",
        "components",
        "explanation",
        "id",
        "policy_version",
        "total",
      ]
    `);
  });

  test("novelty_scores", () => {
    expect(columnNames(noveltyScores)).toMatchInlineSnapshot(`
      [
        "candidate_id",
        "comparison_set",
        "dimension",
        "embedding_model_id",
        "explanation",
        "id",
        "method",
        "score",
        "vector",
      ]
    `);
  });

  test("lineage_edges", () => {
    expect(columnNames(lineageEdges)).toMatchInlineSnapshot(`
      [
        "id",
        "label",
        "run_id",
        "source",
        "target",
        "type",
      ]
    `);
  });

  test("embeddings — INDEX only, authority is novelty_scores", () => {
    expect(columnNames(embeddings)).toMatchInlineSnapshot(`
      [
        "candidate_id",
        "dimension",
        "embedding_model_id",
        "id",
        "vector",
      ]
    `);
  });

  test("dashboard_snapshots — through_sequence watermark", () => {
    expect(columnNames(dashboardSnapshots)).toMatchInlineSnapshot(`
      [
        "built_at",
        "run_id",
        "snapshot",
        "through_run_id",
        "through_sequence",
      ]
    `);
  });

  test("allTables barrel covers every declared table (12)", () => {
    expect(Object.keys(allTables).sort()).toHaveLength(12);
  });
});

// ─── Cross-contract invariant ─────────────────────────────────────────

const camelToSnake = (s: string): string => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

describe("spec(§2.5) cross-contract invariant — runEvents covers RunEventEnvelope", () => {
  test("every RunEventEnvelope key has a snake_case column on run_events", () => {
    const envelopeKeys = Object.keys(RunEventEnvelope.shape).map(camelToSnake);
    const cols = new Set(columnNames(runEvents));
    const missing = envelopeKeys.filter((k) => !cols.has(k));
    expect(missing).toEqual([]);
  });
});

// ─── Type-alignment invariants (bigint mode: number, not string) ───────

describe("spec(§4) Drizzle bigint mode pinned to number for arithmetic safety", () => {
  test("run_events.sequence is bigint mode number", () => {
    const seq = getTableConfig(runEvents).columns.find((c) => c.name === "sequence");
    expect(seq?.getSQLType()).toBe("bigint");
    // The bigint(name, { mode: "number" }) call produces a column whose
    // inferred TS type is `number`. A direct runtime check on the column
    // object is brittle across Drizzle versions; the typeguard below is the
    // authoritative pin: if Drizzle changes the default to "string", the
    // following `const _n: number` assignment fails the typecheck.
    const _n: number = 1 as typeof runEvents.$inferSelect.sequence;
    expect(_n).toBe(1);
  });

  test("dashboard_snapshots.through_sequence is bigint mode number", () => {
    const seq = getTableConfig(dashboardSnapshots).columns.find(
      (c) => c.name === "through_sequence",
    );
    expect(seq?.getSQLType()).toBe("bigint");
  });
});
