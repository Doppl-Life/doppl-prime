import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeAgardenRating } from "../src/server/agardenRatingService";
import type { CalibratorIndex } from "../src/types";

const index: CalibratorIndex = {
  generated_at: "2026-06-24T00:00:00.000Z",
  source_kind: "agarden",
  comparison_sets: [],
  cases: [
    {
      node_id: "case-a",
      case_id: "case-a",
      title: "Case A",
      source_kind: "agarden",
      visibility: "internal",
      source_paths: ["flow/case-a/case-a.md"],
      body: "# Case A",
      problem: { body: "Problem", source: "agarden" },
      problem_recoveries: [
        {
          node_id: "node-pr",
          case_id: "case-a",
          problem_recovery_id: "node-pr",
          title: "Problem Recovery",
          source_path: "flow/case-a/problem-recovery/node-pr.md",
          source_type: "kernel",
          source_status: "imported",
          body: "# Problem Recovery\n\nRecovered problem.",
          human_ratings: [],
        },
      ],
      solutions: [],
    },
  ],
};

describe("writeAgardenRating", () => {
  it("writes the ratings ledger and materializes scores onto the selected node", async () => {
    const agardenRoot = await mkdtemp(join(tmpdir(), "agarden-service-"));
    const nodePath = join(agardenRoot, "flow/case-a/problem-recovery/node-pr.md");
    await mkdir(join(agardenRoot, "flow/case-a/problem-recovery"), { recursive: true });
    await writeFile(
      nodePath,
      `---
id: node-pr
stage: problem_recovery
scores:
  judge: 2
---
# Problem Recovery
`,
      "utf8",
    );

    const result = await writeAgardenRating({
      agardenRoot,
      index,
      now: new Date("2026-06-24T16:00:00.000Z"),
      submission: {
        case_id: "case-a",
        rating_target: "problem_recovery",
        problem_recovery_id: "node-pr",
        node_id: "node-pr",
        score: 5,
        notes: "",
        reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
      },
    });

    expect(result).toMatchObject({
      relativePath: "ratings-ledger.json",
      scores: { judge: 2, human: 5, n: 1 },
    });
    expect(JSON.parse(await readFile(join(agardenRoot, "ratings-ledger.json"), "utf8"))).toEqual([
      {
        node_id: "node-pr",
        ratings: [
          {
            rater_id: "dalton.dinderman@challenger.gauntletai.com",
            score: 5,
            rate_date: "2026-06-24T16:00:00.000Z",
          },
        ],
      },
    ]);
    await expect(readFile(nodePath, "utf8")).resolves.toContain("human: 5");
  });

  it("rejects submissions whose node_id does not match the selected artifact", async () => {
    const agardenRoot = await mkdtemp(join(tmpdir(), "agarden-service-"));

    await expect(
      writeAgardenRating({
        agardenRoot,
        index,
        submission: {
          case_id: "case-a",
          rating_target: "problem_recovery",
          problem_recovery_id: "node-pr",
          node_id: "wrong-node",
          score: 4,
          notes: "",
          reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
        },
      }),
    ).rejects.toThrow("node_id mismatch");
  });
});
