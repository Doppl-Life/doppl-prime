import { describe, expect, it, vi } from "vitest";
import { readGitHubAgardenIndex } from "../src/githubAgardenIndex";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/markdown" },
  });
}

describe("readGitHubAgardenIndex", () => {
  it("builds a calibrator index from jsDelivr's public flat package listing", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();

      if (url.startsWith("https://data.test/loopstrangest/agarden@main/flat")) {
        return jsonResponse({
          files: [
            { name: "/README.md", size: 100 },
            { name: "/flow/cdn-case/cdn-case.md", size: 200 },
            { name: "/flow/cdn-case/cdn-pr/cdn-pr.md", size: 200 },
            { name: "/flow/cdn-case/cdn-pr/cdn-doppl/cdn-doppl.md", size: 200 },
          ],
        });
      }
      if (url.startsWith("https://cdn.test/loopstrangest/agarden@main/flow/cdn-case/cdn-case.md")) {
        return textResponse(`---
id: cdn-case-id
stage: case_study
---
# CDN Case

## Context

This came from the CDN listing.`);
      }
      if (url.startsWith("https://cdn.test/loopstrangest/agarden@main/flow/cdn-case/cdn-pr/cdn-pr.md")) {
        return textResponse(`---
id: cdn-pr-id
stage: problem_recovery
kernel: dalton
---
# CDN Problem Recovery

prev_id: [[cdn-case-id]]`);
      }
      if (url.startsWith("https://cdn.test/loopstrangest/agarden@main/flow/cdn-case/cdn-pr/cdn-doppl/cdn-doppl.md")) {
        return textResponse(`---
id: cdn-doppl-id
stage: doppl
kernel: dalton
---
# CDN Doppl

prev_id: [[cdn-pr-id]]`);
      }

      return jsonResponse({ message: `unexpected ${url}` }, 404);
    });

    const index = await readGitHubAgardenIndex(
      {
        owner: "loopstrangest",
        repo: "agarden",
        branch: "main",
        source: "jsdelivr",
        cdnBaseUrl: "https://cdn.test",
        packageApiBaseUrl: "https://data.test",
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(index.cases[0]).toMatchObject({
      case_id: "cdn-case-id",
      title: "CDN Case",
      source_paths: ["flow/cdn-case/cdn-case.md"],
    });
    expect(index.cases[0].problem_recoveries[0]).toMatchObject({
      problem_recovery_id: "cdn-pr-id",
      child_ids: ["cdn-doppl-id"],
    });
    expect(index.cases[0].solutions[0]).toMatchObject({
      solution_id: "cdn-doppl-id",
      parent_ids: ["cdn-pr-id"],
    });
  });

  it("builds a calibrator index from a forked aGarden flow tree", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();

      if (url.startsWith("https://example.test/repos/loopstrangest/agarden/contents/flow?")) {
        return jsonResponse([
          { name: "live-case", path: "flow/live-case", type: "dir" },
        ]);
      }
      if (url.startsWith("https://example.test/repos/loopstrangest/agarden/contents/flow/live-case?")) {
        return jsonResponse([
          {
            name: "live-case.md",
            path: "flow/live-case/live-case.md",
            type: "file",
            download_url: "https://raw.test/flow/live-case/live-case.md",
          },
          { name: "live-pr", path: "flow/live-case/live-pr", type: "dir" },
        ]);
      }
      if (url.startsWith("https://example.test/repos/loopstrangest/agarden/contents/flow/live-case/live-pr?")) {
        return jsonResponse([
          {
            name: "live-pr.md",
            path: "flow/live-case/live-pr/live-pr.md",
            type: "file",
            download_url: "https://raw.test/flow/live-case/live-pr/live-pr.md",
          },
          { name: "live-doppl", path: "flow/live-case/live-pr/live-doppl", type: "dir" },
        ]);
      }
      if (url.startsWith("https://example.test/repos/loopstrangest/agarden/contents/flow/live-case/live-pr/live-doppl?")) {
        return jsonResponse([
          {
            name: "live-doppl.md",
            path: "flow/live-case/live-pr/live-doppl/live-doppl.md",
            type: "file",
            download_url: "https://raw.test/flow/live-case/live-pr/live-doppl/live-doppl.md",
          },
        ]);
      }
      if (url.startsWith("https://raw.test/flow/live-case/live-case.md")) {
        return textResponse(`---
id: live-case-id
stage: case_study
name: Live Case
---
# Live Fork Case

## Context

This case came from the forked aGarden.

## Synopsis

The calibrator should read this without a rebuild.`);
      }
      if (url.startsWith("https://raw.test/flow/live-case/live-pr/live-pr.md")) {
        return textResponse(`---
id: live-pr-id
stage: problem_recovery
kernel: dalton
next: doppl
scores:
  judge: 3
  human: null
  n: 0
---
# Live Fork Problem Recovery

prev_id: [[live-case-id]]

## Growth — Problem Recovery

Claim - The forked PR is rateable.`);
      }
      if (url.startsWith("https://raw.test/flow/live-case/live-pr/live-doppl/live-doppl.md")) {
        return textResponse(`---
id: live-doppl-id
stage: doppl
kernel: dalton
next: terminal
scores:
  judge: 4
  human: null
  n: 0
---
# Live Fork Doppl

prev_id: [[live-pr-id]]

## Growth — Doppl

Claim - The forked doppl is rateable.`);
      }

      return jsonResponse({ message: `unexpected ${url}` }, 404);
    });

    const index = await readGitHubAgardenIndex(
      {
        owner: "loopstrangest",
        repo: "agarden",
        branch: "main",
        apiBaseUrl: "https://example.test",
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(index.source_kind).toBe("agarden");
    expect(index.cases).toHaveLength(1);
    expect(index.cases[0]).toMatchObject({
      case_id: "live-case-id",
      title: "Live Fork Case",
      source_paths: ["flow/live-case/live-case.md"],
      problem: { body: "This case came from the forked aGarden.", source: "agarden" },
    });
    expect(index.cases[0].problem_recoveries[0]).toMatchObject({
      problem_recovery_id: "live-pr-id",
      title: "Live Fork Problem Recovery",
      parent_ids: ["live-case-id"],
      child_ids: ["live-doppl-id"],
      source_path: "flow/live-case/live-pr/live-pr.md",
      source_type: "kernel",
      scores: { judge: 3, human: null, n: 0 },
    });
    expect(index.cases[0].solutions[0]).toMatchObject({
      solution_id: "live-doppl-id",
      title: "Live Fork Doppl",
      parent_ids: ["live-pr-id"],
      source_path: "flow/live-case/live-pr/live-doppl/live-doppl.md",
      source_type: "kernel",
      scores: { judge: 4, human: null, n: 0 },
    });
  });
});
