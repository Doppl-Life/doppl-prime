import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import {
  type GitAgardenClient,
  type GitTextFileWrite,
  writeGithubAgardenRating,
} from "../src/server/githubAgardenWriter";
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

class FakeGitClient implements GitAgardenClient {
  files = new Map<string, { content: string; sha: string }>();
  commits: Array<{ message: string; files: GitTextFileWrite[] }> = [];
  conflictOnce = false;

  constructor() {
    this.files.set("ratings-ledger.json", { content: "[]\n", sha: "ledger-1" });
    this.files.set("flow/case-a/problem-recovery/node-pr.md", {
      content: [
        "---",
        "id: node-pr",
        "stage: problem_recovery",
        "scores: { judge: 2, human: null, n: 0 }",
        "---",
        "# Problem Recovery",
        "",
      ].join("\n"),
      sha: "node-1",
    });
  }

  async readTextFile(path: string) {
    const file = this.files.get(path);
    if (!file) throw new Error(`Missing file ${path}`);
    return { path, ...file };
  }

  async commitTextFiles(input: { message: string; files: GitTextFileWrite[] }) {
    if (this.conflictOnce) {
      this.conflictOnce = false;
      const error = new Error("stale sha") as Error & { status: number };
      error.status = 409;
      throw error;
    }
    for (const file of input.files) {
      const current = this.files.get(file.path);
      if (!current || current.sha !== file.previousSha) {
        const error = new Error("stale sha") as Error & { status: number };
        error.status = 409;
        throw error;
      }
    }
    this.commits.push(input);
    const commitSha = `commit-${this.commits.length}`;
    for (const file of input.files) {
      this.files.set(file.path, { content: file.content, sha: `${file.path}:${commitSha}` });
    }
    return { commitSha };
  }
}

describe("writeGithubAgardenRating", () => {
  it("commits ratings ledger and node projection together", async () => {
    const client = new FakeGitClient();

    const result = await writeGithubAgardenRating({
      client,
      index,
      now: new Date("2026-06-24T16:30:00.000Z"),
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
      commitSha: "commit-1",
      ledgerPath: "ratings-ledger.json",
      nodePath: "flow/case-a/problem-recovery/node-pr.md",
      scores: { human: 5, n: 1 },
      retried: false,
    });
    expect(client.commits).toHaveLength(1);
    expect(client.commits[0].files.map((file) => file.path)).toEqual([
      "ratings-ledger.json",
      "flow/case-a/problem-recovery/node-pr.md",
    ]);
    expect(JSON.parse(client.files.get("ratings-ledger.json")?.content ?? "")).toEqual([
      {
        node_id: "node-pr",
        ratings: [
          {
            rater_id: "dalton.dinderman@challenger.gauntletai.com",
            score: 5,
            rate_date: "2026-06-24T16:30:00.000Z",
          },
        ],
      },
    ]);
    const parsed = matter(client.files.get("flow/case-a/problem-recovery/node-pr.md")?.content ?? "");
    expect(parsed.data.scores).toEqual({ judge: 2, human: 5, n: 1 });
  });

  it("replaces an existing rating for the same rater", async () => {
    const client = new FakeGitClient();
    client.files.set("ratings-ledger.json", {
      sha: "ledger-2",
      content: JSON.stringify(
        [
          {
            node_id: "node-pr",
            ratings: [
              {
                rater_id: "dalton.dinderman@challenger.gauntletai.com",
                score: 1,
                rate_date: "2026-06-24T16:00:00.000Z",
              },
              {
                rater_id: "melissa.hargis@challenger.gauntletai.com",
                score: 3,
                rate_date: "2026-06-24T16:05:00.000Z",
              },
            ],
          },
        ],
        null,
        2,
      ),
    });

    const result = await writeGithubAgardenRating({
      client,
      index,
      now: new Date("2026-06-24T16:35:00.000Z"),
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

    expect(result.scores).toEqual({ human: 4, n: 2 });
    const ledger = JSON.parse(client.files.get("ratings-ledger.json")?.content ?? "");
    expect(ledger[0].ratings).toEqual([
      {
        rater_id: "dalton.dinderman@challenger.gauntletai.com",
        score: 5,
        rate_date: "2026-06-24T16:35:00.000Z",
      },
      {
        rater_id: "melissa.hargis@challenger.gauntletai.com",
        score: 3,
        rate_date: "2026-06-24T16:05:00.000Z",
      },
    ]);
  });

  it("retries once after a stale GitHub SHA conflict", async () => {
    const client = new FakeGitClient();
    client.conflictOnce = true;

    const result = await writeGithubAgardenRating({
      client,
      index,
      now: new Date("2026-06-24T16:40:00.000Z"),
      submission: {
        case_id: "case-a",
        rating_target: "problem_recovery",
        problem_recovery_id: "node-pr",
        node_id: "node-pr",
        score: 4,
        notes: "",
        reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
      },
    });

    expect(result).toMatchObject({ commitSha: "commit-1", retried: true, scores: { human: 4, n: 1 } });
    expect(client.commits).toHaveLength(1);
  });
});
