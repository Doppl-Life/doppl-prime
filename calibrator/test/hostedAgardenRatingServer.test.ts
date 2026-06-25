import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionHostedAgardenRatingHandler } from "../src/server/hostedAgardenRatingServer";
import type { CalibratorIndex } from "../src/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const index: CalibratorIndex = {
  generated_at: "2026-06-25T00:00:00.000Z",
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
          body: "# Problem Recovery",
          human_ratings: [],
        },
      ],
      solutions: [],
    },
  ],
};

async function writeIndexFile() {
  const dir = await mkdtemp(join(tmpdir(), "calibrator-index-"));
  const path = join(dir, "calibration-index.json");
  await writeFile(path, JSON.stringify(index), "utf8");
  return path;
}

describe("createProductionHostedAgardenRatingHandler", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses an AGARDEN_GITHUB_TOKEN fallback without requiring GitHub App env vars", async () => {
    const indexPath = await writeIndexFile();
    vi.stubEnv("CALIBRATOR_INDEX_PATH", indexPath);
    vi.stubEnv("CALIBRATOR_WRITE_TOKEN", "review-code");
    vi.stubEnv("AGARDEN_GITHUB_TOKEN", "pat-token");
    vi.stubEnv("AGARDEN_BRANCH", "calibrator-ratings-smoke");

    const calls: Array<{ url: string; init?: RequestInit; authorization?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          init,
          authorization: String((init?.headers as Record<string, string> | undefined)?.authorization ?? ""),
        });
        if (url.includes("/app/installations/")) return jsonResponse({ message: "should not use app" }, 500);
        if (url.includes("/contents/ratings-ledger.json")) {
          expect(url).toContain("ref=calibrator-ratings-smoke");
          return jsonResponse({
            path: "ratings-ledger.json",
            sha: "ledger-sha",
            encoding: "base64",
            content: Buffer.from("[]\n", "utf8").toString("base64"),
          });
        }
        if (url.includes("/contents/flow/case-a/problem-recovery/node-pr.md")) {
          return jsonResponse({
            path: "flow/case-a/problem-recovery/node-pr.md",
            sha: "node-sha",
            encoding: "base64",
            content: Buffer.from("---\nid: node-pr\nscores: { human: null, n: 0 }\n---\n# Node\n", "utf8").toString("base64"),
          });
        }
        if (url.endsWith("/git/ref/heads/calibrator-ratings-smoke")) return jsonResponse({ object: { sha: "head-sha" } });
        if (url.endsWith("/git/commits/head-sha")) return jsonResponse({ sha: "head-sha", tree: { sha: "tree-sha" } });
        if (url.endsWith("/git/blobs")) return jsonResponse({ sha: `blob-${calls.filter((call) => call.url.endsWith("/git/blobs")).length}` });
        if (url.endsWith("/git/trees")) return jsonResponse({ sha: "tree-sha-next" });
        if (url.endsWith("/git/commits")) return jsonResponse({ sha: "commit-sha", tree: { sha: "tree-sha-next" } });
        if (url.endsWith("/git/refs/heads/calibrator-ratings-smoke")) return jsonResponse({ object: { sha: "commit-sha" } });
        return jsonResponse({ message: "not found" }, 404);
      }) as unknown as typeof fetch,
    );

    const handler = createProductionHostedAgardenRatingHandler();
    const response = await handler(
      new Request("https://ratings.example.test/api/agarden/ratings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer review-code",
          origin: "https://doppl-life.github.io",
        },
        body: JSON.stringify({
          case_id: "case-a",
          rating_target: "problem_recovery",
          problem_recovery_id: "node-pr",
          node_id: "node-pr",
          score: 4,
          reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      ratingId: "node-pr:dalton.dinderman@challenger.gauntletai.com",
      commitSha: "commit-sha",
      ledgerPath: "ratings-ledger.json",
      nodePath: "flow/case-a/problem-recovery/node-pr.md",
      scores: { human: 4, n: 1 },
    });
    expect(calls.some((call) => call.url.includes("/app/installations/"))).toBe(false);
    expect(calls.every((call) => call.authorization === "Bearer pat-token")).toBe(true);
  });
});
