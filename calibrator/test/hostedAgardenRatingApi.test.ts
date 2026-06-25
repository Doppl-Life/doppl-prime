import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { createHostedAgardenRatingHandler } from "../src/server/hostedAgardenRatingApi";
import type { GitAgardenClient, GitTextFileWrite } from "../src/server/githubAgardenWriter";
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
    this.commits.push(input);
    const commitSha = `commit-${this.commits.length}`;
    for (const file of input.files) {
      this.files.set(file.path, { content: file.content, sha: `${file.path}:${commitSha}` });
    }
    return { commitSha };
  }
}

function request(body: unknown, init: RequestInit = {}) {
  return new Request("https://ratings.example.test/api/agarden/ratings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://doppl-life.github.io",
      ...init.headers,
    },
    body: JSON.stringify(body),
    ...init,
  });
}

describe("createHostedAgardenRatingHandler", () => {
  it("handles CORS preflight for the configured calibrator origin", async () => {
    const handler = createHostedAgardenRatingHandler({
      readIndex: async () => index,
      createClient: () => new FakeGitClient(),
      allowedOrigins: ["https://doppl-life.github.io"],
    });

    const response = await handler(
      new Request("https://ratings.example.test/api/agarden/ratings", {
        method: "OPTIONS",
        headers: { origin: "https://doppl-life.github.io" },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://doppl-life.github.io");
  });

  it("writes a rating through the GitHub aGarden writer and returns commit metadata", async () => {
    const client = new FakeGitClient();
    const handler = createHostedAgardenRatingHandler({
      readIndex: async () => index,
      createClient: () => client,
      allowedOrigins: ["https://doppl-life.github.io"],
      now: () => new Date("2026-06-24T17:00:00.000Z"),
    });

    const response = await handler(
      request({
        case_id: "case-a",
        rating_target: "problem_recovery",
        problem_recovery_id: "node-pr",
        node_id: "node-pr",
        score: 4,
        notes: "Useful.",
        reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://doppl-life.github.io");
    expect(body).toMatchObject({
      ratingId: "node-pr:dalton.dinderman@challenger.gauntletai.com",
      commitSha: "commit-1",
      ledgerPath: "ratings-ledger.json",
      nodePath: "flow/case-a/problem-recovery/node-pr.md",
      scores: { human: 4, n: 1 },
    });
    expect(client.commits).toHaveLength(1);
    expect(JSON.parse(client.files.get("ratings-ledger.json")?.content ?? "")[0].ratings[0]).toMatchObject({
      rater_id: "dalton.dinderman@challenger.gauntletai.com",
      score: 4,
    });
    const parsed = matter(client.files.get("flow/case-a/problem-recovery/node-pr.md")?.content ?? "");
    expect(parsed.data.scores).toEqual({ judge: 2, human: 4, n: 1 });
  });

  it("rejects hosted writes when bearer auth is required but missing", async () => {
    const client = new FakeGitClient();
    const handler = createHostedAgardenRatingHandler({
      readIndex: async () => index,
      createClient: () => client,
      allowedOrigins: ["https://doppl-life.github.io"],
      authToken: "secret-review-code",
      requireAuth: true,
    });

    const response = await handler(
      request({
        case_id: "case-a",
        rating_target: "problem_recovery",
        problem_recovery_id: "node-pr",
        node_id: "node-pr",
        score: 4,
        reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://doppl-life.github.io");
    expect(body.error).toBe("Unauthorized");
    expect(client.commits).toHaveLength(0);
  });

  it("allows hosted writes when the bearer token matches", async () => {
    const client = new FakeGitClient();
    const handler = createHostedAgardenRatingHandler({
      readIndex: async () => index,
      createClient: () => client,
      authToken: "secret-review-code",
      requireAuth: true,
      now: () => new Date("2026-06-24T17:00:00.000Z"),
    });

    const response = await handler(
      request(
        {
          case_id: "case-a",
          rating_target: "problem_recovery",
          problem_recovery_id: "node-pr",
          node_id: "node-pr",
          score: 5,
          reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
        },
        { headers: { authorization: "Bearer secret-review-code" } },
      ),
    );

    expect(response.status).toBe(201);
    expect(client.commits).toHaveLength(1);
  });

  it("fails closed when hosted auth is required but no token is configured", async () => {
    const client = new FakeGitClient();
    const handler = createHostedAgardenRatingHandler({
      readIndex: async () => index,
      createClient: () => client,
      requireAuth: true,
    });

    const response = await handler(
      request({
        case_id: "case-a",
        rating_target: "problem_recovery",
        problem_recovery_id: "node-pr",
        node_id: "node-pr",
        score: 4,
        reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("auth is not configured");
    expect(client.commits).toHaveLength(0);
  });

  it("rejects invalid raters before creating a commit", async () => {
    const client = new FakeGitClient();
    const handler = createHostedAgardenRatingHandler({
      readIndex: async () => index,
      createClient: () => client,
    });

    const response = await handler(
      request({
        case_id: "case-a",
        rating_target: "problem_recovery",
        problem_recovery_id: "node-pr",
        node_id: "node-pr",
        score: 4,
        reviewer_email: "unknown@example.com",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("allow-listed");
    expect(client.commits).toHaveLength(0);
  });

  it("returns the current GitHub ratings ledger for readback", async () => {
    const client = new FakeGitClient();
    client.files.set("ratings-ledger.json", {
      content: JSON.stringify([{ node_id: "node-pr", ratings: [{ rater_id: "a@test.dev", score: 3, rate_date: "now" }] }]),
      sha: "ledger-2",
    });
    const handler = createHostedAgardenRatingHandler({
      readIndex: async () => index,
      createClient: () => client,
      allowedOrigins: ["https://doppl-life.github.io"],
    });

    const response = await handler(
      new Request("https://ratings.example.test/api/agarden/ratings", {
        method: "GET",
        headers: { origin: "https://doppl-life.github.io" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://doppl-life.github.io");
    await expect(response.json()).resolves.toEqual([
      { node_id: "node-pr", ratings: [{ rater_id: "a@test.dev", score: 3, rate_date: "now" }] },
    ]);
  });
});
